package com.audeat.photo;

import com.audeat.common.ApiExceptions.NotFound;
import com.audeat.inspection.Inspection;
import com.audeat.inspection.InspectionStatus;
import com.audeat.user.Role;
import com.audeat.user.UserAccount;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads photos for {@code GET /api/photos/{id}} (DESIGN §4, S1). */
@Service
public class PhotoService {

  private final PhotoRepository photos;

  public PhotoService(PhotoRepository photos) {
    this.photos = photos;
  }

  /**
   * An inspector may read any photo. An owner may read a photo only from a submitted inspection of
   * their own store; anything else is as missing as an unknown id.
   */
  @Transactional(readOnly = true)
  public Photo load(long id, UserAccount caller) {
    Photo photo = photos.findById(id).orElseThrow(PhotoService::notFound);
    if (caller.getRole() == Role.INSPECTOR) {
      return photo;
    }
    Inspection inspection =
        photo.getResult() != null
            ? photo.getResult().getInspection()
            : photo.getSubmission().getTicket().getResult().getInspection();
    boolean ownStore = Objects.equals(inspection.getStore().getId(), caller.getStore().getId());
    if (!ownStore || inspection.getStatus() != InspectionStatus.SUBMITTED) {
      throw notFound();
    }
    return photo;
  }

  private static NotFound notFound() {
    return new NotFound("Photo not found.");
  }
}
