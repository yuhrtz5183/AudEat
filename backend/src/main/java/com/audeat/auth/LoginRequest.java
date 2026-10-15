package com.audeat.auth;

import jakarta.validation.constraints.NotBlank;

/** Body of {@code POST /api/auth/login}. */
public record LoginRequest(
    @NotBlank(message = "Enter your email.") String email,
    @NotBlank(message = "Enter your password.") String password) {}
