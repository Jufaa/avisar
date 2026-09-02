/**
 * Builds the short link a patient taps to confirm or cancel.
 *
 * Both halves are returned because providers need different things: free text
 * carries the whole URL, while an approved template's dynamic URL button owns
 * the base and takes only the token as its suffix.
 */
export interface ConfirmationLink {
  url: string;
  token: string;
}

export interface ConfirmationLinkFactory {
  createFor(appointmentId: string, expiresAt: Date): Promise<ConfirmationLink>;
}
