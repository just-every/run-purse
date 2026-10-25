/** Native reauthentication: requesting the email link alone authorizes nothing; the owner must confirm it in this browser. */
export async function requestReauthentication() {
 const response = await fetch('/auth/step-up', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export', returnTo: '/app?tab=Settings' }) });
 if (!response.ok) throw new Error('Native reauthentication request refused');
 return 'Confirm the native sign-in email in this browser, then confirm here. Local mail is suppressed; requesting a link alone does not authorize erasure.';
}
