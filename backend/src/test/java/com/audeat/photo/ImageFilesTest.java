package com.audeat.photo;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Photo types are recognized by their first bytes (DESIGN §2). */
class ImageFilesTest {

  @Test
  @DisplayName("recognizes JPEG, PNG and WebP by their signatures")
  void recognizesImages() {
    byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};
    byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0};
    byte[] webp = "RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.ISO_8859_1);

    assertThat(ImageFiles.contentType(jpeg)).hasValue("image/jpeg");
    assertThat(ImageFiles.contentType(png)).hasValue("image/png");
    assertThat(ImageFiles.contentType(webp)).hasValue("image/webp");
  }

  @Test
  @DisplayName("refuses other files, whatever they are named, and empty or truncated ones")
  void refusesOtherFiles() {
    byte[] gif = "GIF89a".getBytes(StandardCharsets.US_ASCII);
    byte[] wav = "RIFF\0\0\0\0WAVE".getBytes(StandardCharsets.US_ASCII);
    byte[] text = "hello".getBytes(StandardCharsets.US_ASCII);

    assertThat(ImageFiles.contentType(gif)).isEmpty();
    assertThat(ImageFiles.contentType(wav)).isEmpty();
    assertThat(ImageFiles.contentType(text)).isEmpty();
    assertThat(ImageFiles.contentType(new byte[0])).isEmpty();
    assertThat(ImageFiles.contentType(new byte[] {(byte) 0xFF, (byte) 0xD8})).isEmpty();
    assertThat(ImageFiles.contentType("RIFF\0\0".getBytes(StandardCharsets.US_ASCII))).isEmpty();
  }
}
