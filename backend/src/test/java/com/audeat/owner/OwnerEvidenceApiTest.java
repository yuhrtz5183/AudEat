package com.audeat.owner;

import static com.audeat.TestData.result;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.inspection.Inspection;
import com.audeat.photo.Photo;
import com.audeat.photo.PhotoRepository;
import com.audeat.remediation.RemediationSubmission;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.RemediationTicketRepository;
import com.audeat.remediation.TicketDetailResponse;
import com.audeat.remediation.TicketStatus;
import com.audeat.remediation.TicketViews;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The owner's remediation evidence: {@code POST /api/my-store/tickets/{ticketId}/submissions} (US
 * 5). Runs on a real port as well, because only a real server enforces the multipart size limit.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OwnerEvidenceApiTest {

  private static final String NOT_AUTHORIZED = "You are not authorized to view this page.";
  private static final String TICKET_NOT_FOUND = "Ticket not found.";
  private static final String NOT_WAITING = "This ticket is not waiting for evidence.";
  private static final String EVIDENCE_REQUIRED = "Evidence is required.";
  private static final String DESCRIBE_FIX = "Describe how you fixed the issue.";
  private static final String NOT_AN_IMAGE = "Evidence must be a JPEG, PNG or WebP image.";
  private static final String TOO_MANY = "Upload at most 5 files.";
  private static final String COMMENT_TOO_LONG = "Use 1000 characters or fewer.";
  private static final String FIX = "Replaced the cooler gasket; it now holds 38°F.";

  /** A real 1x1 PNG. */
  private static final byte[] PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9aw"
                  + "AAAABJRU5ErkJggg==");

  /** The start of a JFIF JPEG: SOI, then the APP0 segment. */
  private static final byte[] JPEG = {
    (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1, 1, 0
  };

  /** "RIFF", a size, "WEBP": enough for the type check. */
  private static final byte[] WEBP = {'R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P'};

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private RemediationTicketRepository tickets;
  @Autowired private RemediationSubmissionRepository submissions;
  @Autowired private PhotoRepository photos;
  @Autowired private TicketViews ticketViews;
  @Autowired private TransactionTemplate transaction;
  @Autowired private Clock clock;
  @LocalServerPort private int port;

  private Store bluePlate;
  private Store corner;
  private UserAccount inspector;
  private UserAccount owner;
  private LocalDate today;
  private Inspection blue;

  @BeforeEach
  void cleanDatabase() {
    testData.cleanAll();
    bluePlate = testData.store("Blue Plate Diner");
    corner = testData.store("Corner Bakery Co.");
    inspector = testData.inspector();
    owner = testData.owner("Blue Plate Diner");
    today = LocalDate.now(clock);
    blue = testData.submittedInspection(bluePlate, inspector, 1, 2, 3, 4, 5);
  }

  @Test
  @DisplayName(
      "AC 5.1: an owner's comment and photo for an open ticket are saved as a submission linked to"
          + " the ticket, and the ticket is awaiting review")
  void submitEvidenceForOpenTicket() throws Exception {
    RemediationTicket ticket = openTicket();
    // Another open ticket of the same store, so evidence linked to the wrong ticket shows up.
    RemediationTicket neighbour =
        testData.ticket(result(blue, 2), TicketStatus.OPEN, today.plusDays(5));
    Instant before = clock.instant();

    String body =
        submit(owner, ticket.getId(), "  " + FIX + "\n", file("fix.png", PNG))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(ticket.getId()))
            .andExpect(jsonPath("$.status").value("awaiting_review"))
            .andExpect(jsonPath("$.issue.resolved").value(false))
            .andExpect(jsonPath("$.submissions.length()").value(1))
            .andExpect(jsonPath("$.submissions[0].comment").value(FIX))
            .andExpect(jsonPath("$.submissions[0].submittedAt").isString())
            .andExpect(jsonPath("$.submissions[0].evidencePhotoIds.length()").value(1))
            .andExpect(jsonPath("$.submissions[0].decision").value(nullValue()))
            .andExpect(jsonPath("$.submissions[0].reviewComment").value(nullValue()))
            .andExpect(jsonPath("$.submissions[0].reviewedAt").value(nullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
    Instant after = clock.instant();

    assertThat(ticketStatus(ticket)).isEqualTo(TicketStatus.AWAITING_REVIEW);
    long submissionId = ((Number) JsonPath.read(body, "$.submissions[0].id")).longValue();
    long photoId =
        ((Number) JsonPath.read(body, "$.submissions[0].evidencePhotoIds[0]")).longValue();
    transaction.executeWithoutResult(
        tx -> {
          RemediationSubmission saved = submissions.findById(submissionId).orElseThrow();
          assertThat(saved.getTicket().getId()).isEqualTo(ticket.getId());
          assertThat(saved.getComment()).isEqualTo(FIX);
          assertThat(saved.getSubmittedAt())
              .isBetween(before.minusMillis(1), after.plusMillis(1))
              .isCloseTo(
                  Instant.parse(JsonPath.read(body, "$.submissions[0].submittedAt")),
                  within(1, ChronoUnit.MILLIS));
          assertThat(saved.getDecision()).isNull();
          Photo photo = photos.findById(photoId).orElseThrow();
          assertThat(photo.getSubmission().getId()).isEqualTo(submissionId);
          assertThat(photo.getResult()).isNull();
          assertThat(photo.getContentType()).isEqualTo("image/png");
          assertThat(photo.getData()).isEqualTo(PNG);
        });
    assertThat(photos.count()).isEqualTo(1);
    assertThat(submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(ticket.getId())).hasSize(1);
    assertThat(submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(neighbour.getId())).isEmpty();
    assertThat(ticketStatus(neighbour)).isEqualTo(TicketStatus.OPEN);
  }

  @Test
  @DisplayName(
      "AC 5.1: an owner sends new evidence for a rejected ticket; it is awaiting review again and"
          + " the earlier rejected submission is kept")
  void submitEvidenceForRejectedTicket() throws Exception {
    RemediationTicket ticket =
        testData.ticket(result(blue, 1), TicketStatus.REJECTED, today.plusDays(3));

    submit(owner, ticket.getId(), FIX, file("labels.jpg", JPEG))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.status").value("awaiting_review"))
        .andExpect(jsonPath("$.submissions.length()").value(2))
        .andExpect(jsonPath("$.submissions[0].comment").value("Fixed it."))
        .andExpect(jsonPath("$.submissions[0].decision").value("rejected"))
        .andExpect(jsonPath("$.submissions[0].evidencePhotoIds.length()").value(0))
        .andExpect(jsonPath("$.submissions[1].comment").value(FIX))
        .andExpect(jsonPath("$.submissions[1].decision").value(nullValue()))
        .andExpect(jsonPath("$.submissions[1].evidencePhotoIds.length()").value(1));

    assertThat(ticketStatus(ticket)).isEqualTo(TicketStatus.AWAITING_REVIEW);
    assertThat(submissions.findFirstByTicketIdAndDecisionIsNull(ticket.getId())).isPresent();
    assertThat(photos.findAll())
        .singleElement()
        .extracting(Photo::getContentType)
        .isEqualTo("image/jpeg");
  }

  @Test
  @DisplayName(
      "AC 5.1: up to 5 JPEG, PNG or WebP photos are accepted, kept in upload order with their"
          + " detected types; empty file parts are ignored")
  void acceptsFivePhotos() throws Exception {
    RemediationTicket ticket = openTicket();
    byte[][] images = {JPEG, PNG, WEBP, PNG, JPEG};

    String body =
        submit(
                owner,
                ticket.getId(),
                FIX,
                // The client's names and types are ignored: the bytes decide.
                file("one.png", JPEG),
                file("two.png", PNG),
                file("", new byte[0]),
                file("three.jpg", WEBP),
                file("four.png", PNG),
                file("five.jpeg", JPEG))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.submissions[0].evidencePhotoIds.length()").value(5))
            .andReturn()
            .getResponse()
            .getContentAsString();

    List<Integer> ids = JsonPath.read(body, "$.submissions[0].evidencePhotoIds");
    List<String> types =
        List.of("image/jpeg", "image/png", "image/webp", "image/png", "image/jpeg");
    for (int i = 0; i < ids.size(); i++) {
      Photo photo = photos.findById(ids.get(i).longValue()).orElseThrow();
      assertThat(photo.getContentType()).isEqualTo(types.get(i));
      assertThat(photo.getData()).isEqualTo(images[i]);
    }
  }

  @Test
  @DisplayName(
      "AC 5.1: the submission is available to the inspector: in the review queue, in the ticket's"
          + " details and through its photos")
  void submissionIsAvailableToInspector() throws Exception {
    RemediationTicket ticket = openTicket();
    // Another store's open ticket stays out of the queue.
    Inspection other = testData.submittedInspection(corner, inspector, 1);
    testData.ticket(result(other, 1), TicketStatus.OPEN, today.plusDays(1));

    submit(owner, ticket.getId(), FIX, file("fix.png", PNG)).andExpect(status().isCreated());

    TicketDetailResponse detail =
        transaction.execute(
            tx -> {
              List<RemediationTicket> queue =
                  tickets.findByStatusForInspector(TicketStatus.AWAITING_REVIEW);
              assertThat(queue)
                  .extracting(RemediationTicket::getId)
                  .containsExactly(ticket.getId());
              return ticketViews.detail(queue.get(0));
            });
    assertThat(detail.status()).isEqualTo(TicketStatus.AWAITING_REVIEW);
    assertThat(detail.storeName()).isEqualTo("Blue Plate Diner");
    assertThat(detail.submissions())
        .singleElement()
        .satisfies(
            pending -> {
              assertThat(pending.comment()).isEqualTo(FIX);
              assertThat(pending.decision()).isNull();
              assertThat(pending.evidencePhotoIds()).hasSize(1);
            });

    long photoId = detail.submissions().get(0).evidencePhotoIds().get(0);
    as(inspector, get("/api/photos/{id}", photoId))
        .andExpect(status().isOk())
        .andExpect(content().contentType("image/png"))
        .andExpect(content().bytes(PNG));
  }

  @Test
  @DisplayName(
      "AC 5.2: a comment without evidence is not submitted: \"Evidence is required.\", and the"
          + " ticket stays open")
  void rejectsMissingEvidence() throws Exception {
    RemediationTicket ticket = openTicket();

    // No 'files' part at all.
    submit(owner, ticket.getId(), FIX)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors.files").value(EVIDENCE_REQUIRED));
    // An empty file part, as a browser sends for an untouched file input.
    submit(owner, ticket.getId(), FIX, file("", new byte[0]))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors.files").value(EVIDENCE_REQUIRED));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("AC 5.2: a rejected ticket also needs evidence before it is resubmitted")
  void rejectedTicketNeedsEvidence() throws Exception {
    RemediationTicket ticket =
        testData.ticket(result(blue, 1), TicketStatus.REJECTED, today.plusDays(3));

    submit(owner, ticket.getId(), FIX)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.files").value(EVIDENCE_REQUIRED));

    assertNothingSaved(ticket, TicketStatus.REJECTED, 1);
  }

  @Test
  @DisplayName("a blank comment is refused, even with valid evidence")
  void rejectsBlankComment() throws Exception {
    RemediationTicket ticket = openTicket();

    submit(owner, ticket.getId(), " \n ", file("fix.png", PNG))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors.comment").value(DESCRIBE_FIX));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("neither comment nor evidence: both field errors at once")
  void rejectsEmptyForm() throws Exception {
    RemediationTicket ticket = openTicket();

    submit(owner, ticket.getId(), null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(2))
        .andExpect(jsonPath("$.errors.comment").value(DESCRIBE_FIX))
        .andExpect(jsonPath("$.errors.files").value(EVIDENCE_REQUIRED));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("more than 5 files are refused")
  void rejectsSixFiles() throws Exception {
    RemediationTicket ticket = openTicket();
    MockMultipartFile[] six = new MockMultipartFile[6];
    Arrays.setAll(six, i -> file("fix" + i + ".png", PNG));

    submit(owner, ticket.getId(), FIX, six)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors.files").value(TOO_MANY));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("a file named .png that is really text is refused, and so are its valid neighbours")
  void rejectsFileThatIsNotAnImage() throws Exception {
    RemediationTicket ticket = openTicket();
    byte[] text = "just some text, not a picture".getBytes(StandardCharsets.UTF_8);

    submit(
            owner,
            ticket.getId(),
            FIX,
            file("fix.png", PNG),
            new MockMultipartFile("files", "fake.png", "image/png", text))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors.files").value(NOT_AN_IMAGE));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName(
      "a comment longer than the 1000-character column is a field error, not a server error;"
          + " exactly 1000 is accepted")
  void commentLengthLimit() throws Exception {
    RemediationTicket ticket = openTicket();

    submit(owner, ticket.getId(), "x".repeat(1001), file("fix.png", PNG))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors.comment").value(COMMENT_TOO_LONG));
    assertNothingSaved(ticket, TicketStatus.OPEN, 0);

    // Surrounding whitespace is trimmed before the length is checked.
    submit(owner, ticket.getId(), " " + "x".repeat(1000) + " ", file("fix.png", PNG))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.submissions[0].comment").value("x".repeat(1000)));
  }

  @Test
  @DisplayName(
      "a ticket that is not waiting for evidence gets 409, before any field check; nothing is"
          + " saved")
  void ticketNotWaitingForEvidence() throws Exception {
    TicketStatus[] states = {
      TicketStatus.AWAITING_REVIEW, TicketStatus.FOLLOW_UP_SCHEDULED, TicketStatus.APPROVED
    };
    for (int i = 0; i < states.length; i++) {
      TicketStatus state = states[i];
      RemediationTicket ticket = testData.ticket(result(blue, i + 1), state, today.plusDays(3));
      long photosBefore = photos.count();

      submit(owner, ticket.getId(), FIX, file("fix.png", PNG))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$.message").value(NOT_WAITING));
      // Fixing the form would not help, so the state wins over the field errors.
      submit(owner, ticket.getId(), null)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.message").value(NOT_WAITING));

      assertThat(ticketStatus(ticket)).isEqualTo(state);
      assertThat(submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(ticket.getId())).hasSize(1);
      assertThat(photos.count()).isEqualTo(photosBefore);
    }
  }

  @Test
  @DisplayName(
      "another store's ticket, a missing id and a non-numeric id all get the same 404; nothing is"
          + " saved")
  void otherStoresTicketIsNotFound() throws Exception {
    Inspection other = testData.submittedInspection(corner, inspector, 1);
    RemediationTicket foreign =
        testData.ticket(result(other, 1), TicketStatus.OPEN, today.plusDays(3));

    for (Object id : new Object[] {foreign.getId(), foreign.getId() + 1000, "abc"}) {
      as(owner, upload(id, FIX, file("fix.png", PNG)))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$.message").value(TICKET_NOT_FOUND));
    }

    assertNothingSaved(foreign, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("an inspector gets the JSON 403, and nothing is saved")
  void inspectorCannotSubmitEvidence() throws Exception {
    RemediationTicket ticket = openTicket();

    submit(inspector, ticket.getId(), FIX, file("fix.png", PNG))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.message").value(NOT_AUTHORIZED));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("AC 13.3: requires a token")
  void requiresToken() throws Exception {
    RemediationTicket ticket = openTicket();

    mvc.perform(upload(ticket.getId(), FIX, file("fix.png", PNG)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value("Authentication required."));

    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  @Test
  @DisplayName("a file over 5 MB gets the 413 JSON message, and nothing is saved")
  void rejectsFileOver5Mb() throws Exception {
    RemediationTicket ticket = openTicket();
    byte[] large = Arrays.copyOf(PNG, 5 * 1024 * 1024 + 1);
    String boundary = "AudEatBoundary" + System.nanoTime();
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    body.writeBytes(
        ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"comment\"\r\n\r\n" + FIX
                + "\r\n--" + boundary
                + "\r\nContent-Disposition: form-data; name=\"files\"; filename=\"big.png\"\r\n"
                + "Content-Type: image/png\r\n\r\n")
            .getBytes(StandardCharsets.UTF_8));
    body.writeBytes(large);
    body.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

    HttpResponse<String> response =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(
                        URI.create(
                            "http://localhost:" + port + "/api/my-store/tickets/" + ticket.getId()
                                + "/submissions"))
                    .timeout(Duration.ofSeconds(30))
                    .header(HttpHeaders.AUTHORIZATION, testData.bearer(owner))
                    .header(HttpHeaders.CONTENT_TYPE, "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                    .build(),
                HttpResponse.BodyHandlers.ofString());

    assertThat(response.statusCode()).isEqualTo(413);
    assertThat((String) JsonPath.read(response.body(), "$.message"))
        .isEqualTo("Each file must be 5 MB or smaller.");
    assertNothingSaved(ticket, TicketStatus.OPEN, 0);
  }

  private RemediationTicket openTicket() {
    return testData.ticket(result(blue, 1), TicketStatus.OPEN, today.plusDays(3));
  }

  private TicketStatus ticketStatus(RemediationTicket ticket) {
    return tickets.findById(ticket.getId()).orElseThrow().getStatus();
  }

  /** The ticket kept its status and submissions, and no photo was stored anywhere. */
  private void assertNothingSaved(
      RemediationTicket ticket, TicketStatus expected, int submissionCount) {
    assertThat(ticketStatus(ticket)).isEqualTo(expected);
    assertThat(submissions.findByTicketIdOrderBySubmittedAtAscIdAsc(ticket.getId()))
        .hasSize(submissionCount);
    assertThat(photos.count()).isZero();
  }

  private static MockMultipartFile file(String name, byte[] data) {
    return new MockMultipartFile("files", name, "image/png", data);
  }

  private ResultActions submit(
      UserAccount user, long ticketId, String comment, MockMultipartFile... files)
      throws Exception {
    return as(user, upload(ticketId, comment, files));
  }

  private static MockMultipartHttpServletRequestBuilder upload(
      Object ticketId, String comment, MockMultipartFile... files) {
    MockMultipartHttpServletRequestBuilder request =
        multipart("/api/my-store/tickets/{id}/submissions", ticketId);
    for (MockMultipartFile file : files) {
      request.file(file);
    }
    if (comment != null) {
      request.param("comment", comment);
    }
    return request;
  }

  private ResultActions as(UserAccount user, AbstractMockHttpServletRequestBuilder<?> request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
