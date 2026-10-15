package com.audeat.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/register}. Messages match the frontend's so they can be shown
 * next to the field (AC 12.3). The store is checked in {@link AuthService}.
 */
public record RegisterRequest(
    @NotBlank(message = "Enter your full name.")
        @Size(max = 100, message = "Use 100 characters or fewer.")
        String name,
    @NotBlank(message = "Enter your email.")
        @Pattern(regexp = AuthService.EMAIL_PATTERN, message = "Enter a valid email address.")
        @Size(max = 254, message = "Use 254 characters or fewer.")
        String email,
    @NotNull(message = "Enter your password.")
        @Size(min = 8, message = "Use at least 8 characters.")
        String password,
    @NotNull(message = "Choose inspector or store owner.")
        @Pattern(regexp = "inspector|owner", message = "Choose inspector or store owner.")
        String role,
    Long storeId) {}
