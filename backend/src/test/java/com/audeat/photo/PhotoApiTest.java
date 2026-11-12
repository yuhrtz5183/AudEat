package com.audeat.photo;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.checklist.ChecklistRequirementRepository;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.remediation.RemediationSubmissionRepository;
import com.audeat.remediation.RemediationTicket;
import com.audeat.remediation.TicketStatus;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import java.time.Clock;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** {@code GET /api/photos/{id}}: issue photos (AC 2.2, 4.2) and evidence photos (AC 5.1, 6.x). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PhotoApiTest {

  /** "RIFF", a size, "WEBP": enough for the type check. */
  private static final byte[] WEBP = {'R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P'};

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private PhotoRepository photos;
  @Autowired private InspectionRepository inspections;
  @Autowired private ChecklistRequirementRepository requirements;
  @Autowired private RemediationSubmissionRepository submissions;
  @Autowired private Clock clock;

  private Store bluePlate;
  private UserAccount inspector;
  private UserAccount owner;
  private long issuePhoto;
  private long evidencePhoto;

  @BeforeEach
  void createPhotos() {
    testData.cleanAll();
    bluePlate = testData.store("Blue Plate Diner");
    inspector = testData.inspector();
    owner = testData.owner("Blue Plate Diner");
    InspectionResult issue =
        TestData.result(testData.submittedInspection(bluePlate, inspector, 1), 1);
    issuePhoto = photos.save(Photo.ofResult(issue, "image/webp", WEBP, clock.instant())).getId();
    RemediationTicket ticket =
        testData.ticket(issue, TicketStatus.AWAITING_REVIEW, LocalDate.now(clock).plusDays(3));
    evidencePhoto =
        photos
            .save(
                Photo.ofSubmission(
                    submissions.findFirstByTicketIdAndDecisionIsNull(ticket.getId()).orElseThrow(),
                    "image/webp",
                    WEBP,
                    clock.instant()))
            .getId();
  }

  @Test
  @DisplayName("an inspector gets the bytes with the stored type, cacheable by this browser only")
  void inspectorGetsPhoto() throws Exception {
    photo(issuePhoto, inspector)
        .andExpect(status().isOk())
        .andExpect(content().contentType("image/webp"))
        .andExpect(content().bytes(WEBP))
        .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=86400, private"))
        .andExpect(header().stringValues(HttpHeaders.VARY, hasItem(HttpHeaders.AUTHORIZATION)))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    photo(evidencePhoto, inspector).andExpect(status().isOk());
  }

  @Test
  @DisplayName("AC 4.2: the owner of the inspected store gets issue and evidence photos")
  void ownerGetsOwnStorePhotos() throws Exception {
    photo(issuePhoto, owner).andExpect(status().isOk()).andExpect(content().bytes(WEBP));
    photo(evidencePhoto, owner).andExpect(status().isOk());
  }

  @Test
  @DisplayName("AC 9.2: another store's owner gets the same 404 as for a missing photo")
  void otherOwnerGetsNotFound() throws Exception {
    UserAccount otherOwner = testData.owner("Corner Bakery Co.");

    for (long id : new long[] {issuePhoto, evidencePhoto}) {
      photo(id, otherOwner)
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.message").value("Photo not found."));
    }
    photo(Long.MAX_VALUE, inspector)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("Photo not found."));
  }

  @Test
  @DisplayName("an owner cannot see photos of a draft inspection, even at their own store")
  void ownerCannotSeeDraftPhotos() throws Exception {
    Inspection draft =
        Inspection.startRegular(
            bluePlate,
            inspector,
            LocalDate.now(clock),
            requirements.findAllByOrderBySortOrderAsc(),
            clock.instant());
    draft.getResults().get(0).update(false, "Walk-in cooler read 48°F.");
    inspections.save(draft);
    long draftPhoto =
        photos
            .save(Photo.ofResult(draft.getResults().get(0), "image/webp", WEBP, clock.instant()))
            .getId();

    photo(draftPhoto, owner)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("Photo not found."));
    photo(draftPhoto, inspector).andExpect(status().isOk());
  }

  @Test
  @DisplayName("AC 13.3: requires a token")
  void requiresToken() throws Exception {
    mvc.perform(get("/api/photos/{id}", issuePhoto))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.message").value("Authentication required."));
  }

  private ResultActions photo(long id, UserAccount user) throws Exception {
    return mvc.perform(
        get("/api/photos/{id}", id).header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
