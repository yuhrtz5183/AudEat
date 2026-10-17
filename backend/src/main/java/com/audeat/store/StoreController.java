package com.audeat.store;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Store endpoints. The list is public because registration (US 12) needs it. */
@RestController
@RequestMapping("/api/stores")
public class StoreController {

  private final StoreRepository stores;

  public StoreController(StoreRepository stores) {
    this.stores = stores;
  }

  @GetMapping
  public List<StoreResponse> list() {
    return stores.findAll(Sort.by("name")).stream().map(StoreResponse::from).toList();
  }
}
