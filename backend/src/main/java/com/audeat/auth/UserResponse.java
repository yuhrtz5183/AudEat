package com.audeat.auth;

import com.audeat.store.Store;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;

/** A user as returned to the frontend. Never includes the password hash. */
public record UserResponse(
    Long id, String name, String email, Role role, Long storeId, String storeName) {

  static UserResponse from(UserAccount user) {
    Store store = user.getStore();
    return new UserResponse(
        user.getId(),
        user.getName(),
        user.getEmail(),
        user.getRole(),
        store == null ? null : store.getId(),
        store == null ? null : store.getName());
  }
}
