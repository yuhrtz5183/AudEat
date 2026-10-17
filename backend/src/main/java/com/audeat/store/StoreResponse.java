package com.audeat.store;

/** Public view of a store. */
public record StoreResponse(Long id, String name, String address) {

  static StoreResponse from(Store store) {
    return new StoreResponse(store.getId(), store.getName(), store.getAddress());
  }
}
