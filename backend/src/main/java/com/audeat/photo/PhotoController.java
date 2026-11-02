package com.audeat.photo;

import com.audeat.security.CurrentUser;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves photo bytes to any signed-in user allowed to see them. The frontend fetches them with
 * the bearer header and shows them through a {@code blob:} URL.
 */
@RestController
@RequestMapping("/api/photos")
public class PhotoController {

  private final PhotoService photos;
  private final CurrentUser currentUser;

  public PhotoController(PhotoService photos, CurrentUser currentUser) {
    this.photos = photos;
    this.currentUser = currentUser;
  }

  /** Photos never change, so the browser may keep them for a day. */
  @GetMapping("/{id}")
  public ResponseEntity<byte[]> photo(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
    Photo photo = photos.load(id, currentUser.require(jwt));
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(photo.getContentType()))
        .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
        .body(photo.getData());
  }
}
