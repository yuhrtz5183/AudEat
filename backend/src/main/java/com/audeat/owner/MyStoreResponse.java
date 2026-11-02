package com.audeat.owner;

/**
 * The signed-in owner's store (AC 15.1).
 *
 * @param openTicketCount the store's tickets not yet approved
 * @param rejectedCount the tickets an inspector sent back for further action (AC 6.2)
 */
public record MyStoreResponse(
    Long id, String name, String address, long openTicketCount, long rejectedCount) {}
