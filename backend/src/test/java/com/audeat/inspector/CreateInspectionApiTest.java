package com.audeat.inspector;

import static com.audeat.TestData.result;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.audeat.TestData;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionRepository;
import com.audeat.inspection.InspectionResult;
import com.audeat.remediation.TicketStatus;
import com.audeat.store.Store;
import com.audeat.user.UserAccount;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;

/** Starting, marking and submitting an inspection (US 1). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CreateInspectionApiTest {

  @Autowired private MockMvc mvc;
  @Autowired private TestData testData;
  @Autowired private InspectionRepository inspections;
  @Autowired private Clock clock;

  private Store harbor;
  private UserAccount inspector;
  private UserAccount owner;

  private static final byte[] PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9aw"
                  + "AAAABJRU5ErkJggg==");

  @BeforeEach
  void cleanDatabase() {
    testData.cleanAll();
    harbor = testData.store("Harbor Noodle House");
    inspector = testData.inspector();
    owner = testData.owner("Harbor Noodle House");
  }

  @Test
  @DisplayName("AC 1.1: starting creates one unmarked draft and resumes it")
  void startAndResume() throws Exception {
    MvcResult created =
        start(inspector, harbor.getId())
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("draft"))
            .andExpect(jsonPath("$.storeName").value("Harbor Noodle House"))
            .andExpect(jsonPath("$.inspectionDate").value(LocalDate.now(clock).toString()))
            .andExpect(jsonPath("$.violationCount").value(0))
            .andExpect(jsonPath("$.results", hasSize(8)))
            .andExpect(jsonPath("$.results[0].compliant").value(nullValue()))
            .andExpect(jsonPath("$.results[0].requirement").value(org.hamcrest.Matchers.startsWith("Cold food")))
            .andReturn();
    int id = JsonPath.read(created.getResponse().getContentAsString(), "$.id");

    start(inspector, harbor.getId())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id))
        .andExpect(jsonPath("$.status").value("draft"));

    as(testData.inspector(), post("/api/stores/{id}/inspections", harbor.getId()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.not(id)));
  }

  @Test
  @DisplayName("AC 1.2: a fully marked inspection is submitted and kept on the store's history")
  void submitWhenEveryLineIsMarked() throws Exception {
    MvcResult created = start(inspector, harbor.getId()).andExpect(status().isCreated()).andReturn();
    String body = created.getResponse().getContentAsString();
    int id = JsonPath.read(body, "$.id");
    List<Integer> resultIds = JsonPath.read(body, "$.results[*].id");
    for (int resultId : resultIds) {
      mark(inspector, resultId, true, null).andExpect(status().isOk());
    }

    submit(inspector, id)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("submitted"))
        .andExpect(jsonPath("$.violationCount").value(0))
        .andExpect(jsonPath("$.inspectorName").value(inspector.getName()));

    as(inspector, get("/api/stores/{id}/inspections", harbor.getId()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value(id))
        .andExpect(jsonPath("$[0].violationCount").value(0));
    submit(inspector, id)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").value("This inspection has already been submitted."));
  }

  @Test
  @DisplayName("AC 1.3: an unmarked line is not submitted")
  void unmarkedLineBlocksSubmit() throws Exception {
    MvcResult created = start(inspector, harbor.getId()).andExpect(status().isCreated()).andReturn();
    String body = created.getResponse().getContentAsString();
    int id = JsonPath.read(body, "$.id");
    int first = JsonPath.read(body, "$.results[0].id");

    submit(inspector, id)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors['results." + first + "']").value("Mark this requirement."));
    as(inspector, get("/api/inspections/{id}", id))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("draft"));
  }

  @Test
  @DisplayName("another inspector's draft and an owner cannot change the inspection")
  void onlyTheInspectorEditsTheDraft() throws Exception {
    MvcResult created = start(inspector, harbor.getId()).andExpect(status().isCreated()).andReturn();
    int resultId = JsonPath.read(created.getResponse().getContentAsString(), "$.results[0].id");
    int inspectionId = JsonPath.read(created.getResponse().getContentAsString(), "$.id");

    mark(testData.inspector(), resultId, false, "Too warm.").andExpect(status().isNotFound());
    mark(owner, resultId, true, null).andExpect(status().isForbidden());
    submit(owner, inspectionId).andExpect(status().isForbidden());
    as(owner, post("/api/stores/{id}/inspections", harbor.getId())).andExpect(status().isForbidden());
    as(inspector, post("/api/stores/{id}/inspections", 99999))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("Store not found."));
  }

  @Test
  @DisplayName("AC 7.3: submitting a follow-up records its result on the ticket")
  void submitFollowUpResolvesTheTicket() throws Exception {
    Store bluePlate = testData.store("Blue Plate Diner");
    Inspection visit = testData.submittedInspection(bluePlate, inspector, 4);
    InspectionResult issue = result(visit, 4);
    testData.ticket(issue, TicketStatus.FOLLOW_UP_SCHEDULED, LocalDate.now(clock).plusDays(1));
    Inspection followUp =
        inspections.findWithResultsById(
                inspections.findByFollowUpOfIdInOrderByIdAsc(List.of(issue.getId())).get(0).getId())
            .orElseThrow();

    mark(inspector, followUp.getResults().get(0).getId(), true, "Fixed.").andExpect(status().isOk());
    submit(inspector, followUp.getId())
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("submitted"))
        .andExpect(jsonPath("$.results[0].compliant").value(true));
  }

  @Test
  @DisplayName("AC 2.1: marking a requirement non-compliant flags it and saves a comment")
  void flagIssueWithComment() throws Exception {
    MvcResult created = start(inspector, harbor.getId()).andExpect(status().isCreated()).andReturn();
    int resultId = JsonPath.read(created.getResponse().getContentAsString(), "$.results[0].id");

    mark(inspector, resultId, false, "Cooler temperature was 48°F.")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.compliant").value(false))
        .andExpect(jsonPath("$.comment").value("Cooler temperature was 48°F."))
        .andExpect(jsonPath("$.resolved").value(false));
  }

  @Test
  @DisplayName("AC 2.2: attaches a photo to a flagged issue and serves the photo bytes")
  void attachPhotoToFlaggedIssue() throws Exception {
    MvcResult created = start(inspector, harbor.getId()).andExpect(status().isCreated()).andReturn();
    int resultId = JsonPath.read(created.getResponse().getContentAsString(), "$.results[0].id");
    int inspectionId = JsonPath.read(created.getResponse().getContentAsString(), "$.id");

    // Cannot attach photo while unflagged (null or compliant)
    MockMultipartFile pngFile = new MockMultipartFile("file", "issue.png", "image/png", PNG);
    as(inspector, multipart("/api/results/{id}/photos", resultId).file(pngFile))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.message").value("Only a flagged issue can have photos."));

    mark(inspector, resultId, false, "Thermometer reading.").andExpect(status().isOk());

    MvcResult photoResult =
        as(inspector, multipart("/api/results/{id}/photos", resultId).file(pngFile))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").isNumber())
            .andReturn();
    int photoId = JsonPath.read(photoResult.getResponse().getContentAsString(), "$.id");

    // Inspection detail includes the photo id
    as(inspector, get("/api/inspections/{id}", inspectionId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].photoIds[0]").value(photoId));

    // Photo bytes are served via GET /api/photos/{id}
    as(inspector, get("/api/photos/{id}", photoId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$").doesNotExist()); // returns binary image

    // Rejects invalid image types
    MockMultipartFile textFile =
        new MockMultipartFile("file", "test.txt", "text/plain", "not an image".getBytes());
    as(inspector, multipart("/api/results/{id}/photos", resultId).file(textFile))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors.file").value("Evidence must be a JPEG, PNG or WebP image."));
  }

  private ResultActions start(UserAccount user, long storeId) throws Exception {
    return as(user, post("/api/stores/{id}/inspections", storeId));
  }

  private ResultActions mark(UserAccount user, long resultId, boolean compliant, String comment)
      throws Exception {
    String json =
        comment == null
            ? "{\"compliant\":" + compliant + ",\"comment\":null}"
            : "{\"compliant\":" + compliant + ",\"comment\":\"" + comment + "\"}";
    return as(
        user,
        put("/api/results/{id}", resultId).contentType(MediaType.APPLICATION_JSON).content(json));
  }

  private ResultActions submit(UserAccount user, long inspectionId) throws Exception {
    return as(user, post("/api/inspections/{id}/submit", inspectionId));
  }

  private ResultActions as(UserAccount user, AbstractMockHttpServletRequestBuilder<?> request)
      throws Exception {
    return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, testData.bearer(user)));
  }
}
