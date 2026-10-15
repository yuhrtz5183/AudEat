package com.audeat.auth;

/** Successful login: a bearer token plus the signed-in user. */
public record LoginResponse(String token, UserResponse user) {}
