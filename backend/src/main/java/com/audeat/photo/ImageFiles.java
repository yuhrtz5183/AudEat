package com.audeat.photo;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

/**
 * The photo rules (DESIGN §2): JPEG, PNG or WebP, recognized by the file's first bytes and never
 * by the client's Content-Type. Spring's multipart limit caps each file at 5 MB.
 */
public final class ImageFiles {

  /** Per flagged issue, and per owner submission. */
  public static final int MAX_PHOTOS = 5;

  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
  private static final byte[] RIFF = "RIFF".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] WEBP = "WEBP".getBytes(StandardCharsets.US_ASCII);

  private ImageFiles() {}

  /** The content type to store, or empty when the bytes are not a JPEG, PNG or WebP image. */
  public static Optional<String> contentType(byte[] data) {
    if (startsWith(data, 0, JPEG)) {
      return Optional.of("image/jpeg");
    }
    if (startsWith(data, 0, PNG)) {
      return Optional.of("image/png");
    }
    // RIFF, a 4-byte size, then WEBP.
    if (startsWith(data, 0, RIFF) && startsWith(data, 8, WEBP)) {
      return Optional.of("image/webp");
    }
    return Optional.empty();
  }

  private static boolean startsWith(byte[] data, int offset, byte[] prefix) {
    return data.length >= offset + prefix.length
        && Arrays.equals(data, offset, offset + prefix.length, prefix, 0, prefix.length);
  }
}
