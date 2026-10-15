package com.audeat.store;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** {@code GET /api/stores}, used by registration (AC 12.1). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StoreApiTest {

  @Autowired private MockMvc mvc;

  @Test
  @DisplayName("AC 12.1: lists stores by name without signing in")
  void listsStoresPublicly() throws Exception {
    mvc.perform(get("/api/stores"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(3))
        .andExpect(jsonPath("$[0].name").value("Blue Plate Diner"))
        .andExpect(jsonPath("$[0].address").value("412 Main St"))
        .andExpect(jsonPath("$[0].id").isNumber())
        .andExpect(jsonPath("$[1].name").value("Corner Bakery Co."))
        .andExpect(jsonPath("$[2].name").value("Harbor Noodle House"));
  }
}
