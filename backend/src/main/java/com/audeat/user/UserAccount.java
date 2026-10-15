package com.audeat.user;

import com.audeat.store.Store;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/** A registered inspector or store owner. */
@Entity
@Table(name = "users")
public class UserAccount {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Role role;

  /** The owner's store; null for inspectors. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "store_id")
  private Store store;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected UserAccount() {}

  public UserAccount(
      String name, String email, String passwordHash, Role role, Store store, Instant createdAt) {
    this.name = name;
    this.email = email;
    this.passwordHash = passwordHash;
    this.role = role;
    this.store = store;
    this.createdAt = createdAt;
  }

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getEmail() {
    return email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public Role getRole() {
    return role;
  }

  public Store getStore() {
    return store;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
