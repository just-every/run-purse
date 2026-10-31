/** Repeat Base's shared provider admission and pin boundary in the same D1
 * transaction as a purchasing write. A session authenticated before a provider
 * was disabled or unlinked must not settle a later domain mutation.
 * Native email, password and dev sessions keep their existing authority.
 */
export const currentIdentitySession = `(se.kind!='oidc' OR (
 EXISTS(SELECT 1 FROM oa_provider_sessions ps JOIN oa_auth_settings settings
  ON settings.singleton=1 AND settings.idp_sign_in=1 AND settings.generation=ps.generation
  WHERE ps.session_id=se.id)
 AND EXISTS(SELECT 1 FROM oa_provider_session_pins pin JOIN oa_identity_providers provider
  ON provider.provider_id=pin.provider_id AND provider.status='linked'
  AND provider.issuer=pin.issuer AND provider.client_id=pin.client_id AND provider.linked_at=pin.linked_at
  WHERE pin.session_id=se.id)))`;
