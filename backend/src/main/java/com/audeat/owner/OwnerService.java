package com.audeat.owner;

import com.audeat.auth.AuthExceptions.InvalidFields;
import com.audeat.common.ApiExceptions.NotFound;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionSummaryResponse;
import com.audeat.photo.ImageFiles;
import com.audeat.photo.Photo;
import com.audeat.photo.PhotoRepository;
import com.audeat.remediation.RemediationSubmission;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketStatus;
import com.audeat.remediation.TicketSummaryResponse;
import com.audeat.remediation.TicketViews;
import com.audeat.store.Store;
import com.audeat.store.StoreRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * The owner endpoints, always for the caller's own store (DESIGN Decision 8). Read-only
 * transactions by default, because {@link TicketViews} walks lazy associations; the one write,
 * {@link #submitEvidence}, has its own read-write transaction.
 */
@Service
@Transactional(readOnly = true)
public class OwnerService {

  /** Every status except APPROVED: the ticket still needs the owner or an inspector. */
  private static final Set<TicketStatus> OPEN =
      EnumSet.complementOf(EnumSet.of(TicketStatus.APPROVED));

  /** The size of {@code remediation_submissions.comment} (V3). */
  static final int MAX_COMMENT_LENGTH = 1000;

  private final StoreRepository stores;
  private final RemediationTicketRepository tickets;
  private final RemediationSubmissionRepository submissions;
  private final PhotoRepository photos;
  private final TicketViews ticketViews;
  private final InspectionRepository inspections;
  private final Clock clock;

  public OwnerService(
      StoreRepository stores,
      RemediationTicketRepository tickets,
      RemediationSubmissionRepository submissions,
      PhotoRepository photos,
      TicketViews ticketViews,
      InspectionRepository inspections,
      Clock clock) {
    this.stores = stores;
    this.tickets = tickets;
    this.submissions = submissions;
    this.photos = photos;
    this.ticketViews = ticketViews;
    this.inspections = inspections;
    this.clock = clock;
  }

  /** AC 15.1, plus the AC 6.2 rejected count for the "needs further action" notice. */
  public MyStoreResponse myStore(long storeId) {
    Store store = stores.findById(storeId).orElseThrow();
    return new MyStoreResponse(
        store.getId(),
        store.getName(),
        store.getAddress(),
        tickets.countForStore(storeId, OPEN),
        tickets.countForStore(storeId, EnumSet.of(TicketStatus.REJECTED)));
  }

  /** AC 4.1, 10.1, 10.2: open tickets by nearest deadline (overdue ones first), then approved. */
  public List<TicketSummaryResponse> myTickets(long storeId) {
    return ticketViews.summaries(tickets.findForStore(storeId));
  }

  /**
   * AC 9.1: the store's submitted inspections, newest first, with their violation counts. Drafts
   * (including scheduled follow-ups) are left out. There is no store parameter to change (AC 9.2).
   */
  public List<InspectionSummaryResponse> myInspections(long storeId) {
    return inspections.findHistory(storeId);
  }

  /** AC 4.2. Another store's ticket gets the same 404 as a missing one. */
  public TicketDetailResponse myTicket(long storeId, long ticketId) {
    return ticketViews.ownerDetail(findTicket(storeId, ticketId));
  }

  /**
   * AC 5.1, 5.2: the owner's evidence of the fix, in one transaction (DESIGN §4, O4). The checks
   * run in this order: 404 for a ticket outside the store, then 409 when the ticket is not waiting
   * for evidence (OPEN or REJECTED), then the 400 field errors. A request that can never succeed
   * says so instead of asking for fields that would not help, and the field rules, among them AC
   * 5.2's "Evidence is required.", apply to every ticket that is waiting for evidence. Any failure
   * rolls the whole transaction back, so nothing is saved.
   *
   * @param files the uploaded parts; empty parts (an untouched file input) are ignored
   */
  @Transactional
  public TicketDetailResponse submitEvidence(
      long storeId, long ticketId, String comment, List<MultipartFile> files) {
    RemediationTicket ticket = findTicket(storeId, ticketId);
    // The 409 check. If a field check fails below, the rollback discards this status change.
    ticket.submitEvidence();

    Map<String, String> errors = new LinkedHashMap<>();
    String text = comment == null ? "" : comment.strip();
    if (text.isEmpty()) {
      errors.put("comment", "Describe how you fixed the issue.");
    } else if (text.length() > MAX_COMMENT_LENGTH) {
      errors.put("comment", "Use " + MAX_COMMENT_LENGTH + " characters or fewer.");
    }
    List<Evidence> evidence = new ArrayList<>();
    List<MultipartFile> parts =
        files == null ? List.of() : files.stream().filter(file -> !file.isEmpty()).toList();
    if (parts.isEmpty()) {
      errors.put("files", "Evidence is required.");
    } else if (parts.size() > ImageFiles.MAX_PHOTOS) {
      errors.put("files", "Upload at most " + ImageFiles.MAX_PHOTOS + " files.");
    } else {
      for (MultipartFile part : parts) {
        byte[] data = bytes(part);
        Optional<String> contentType = ImageFiles.contentType(data);
        if (contentType.isEmpty()) {
          errors.put("files", "Evidence must be a JPEG, PNG or WebP image.");
          break;
        }
        evidence.add(new Evidence(contentType.get(), data));
      }
    }
    if (!errors.isEmpty()) {
      throw new InvalidFields(errors);
    }

    Instant now = clock.instant();
    RemediationSubmission submission =
        submissions.save(new RemediationSubmission(ticket, text, now));
    for (Evidence file : evidence) {
      photos.save(Photo.ofSubmission(submission, file.contentType(), file.data(), now));
    }
    // Write now, so a concurrent submit fails here (409) and the response reads the new rows.
    tickets.flush();
    return ticketViews.ownerDetail(ticket);
  }

  /** Another store's ticket gets the same 404 as a missing one (AC 9.2). */
  private RemediationTicket findTicket(long storeId, long ticketId) {
    return tickets
        .findByIdForStore(ticketId, storeId)
        .orElseThrow(() -> new NotFound("Ticket not found."));
  }

  private static byte[] bytes(MultipartFile file) {
    try {
      return file.getBytes();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** An uploaded image that passed the type check. */
  private record Evidence(String contentType, byte[] data) {}
}
