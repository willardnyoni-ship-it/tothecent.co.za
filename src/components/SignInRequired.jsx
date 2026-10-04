// Shown instead of the app when nobody is signed in on this device. An
// account is required: it's what keeps the same budget and business on
// every device. Any budget data already on this device (from before
// sign-in was required) is kept and saved into the account at sign-in -
// the first sync merges it in.
export default function SignInRequired({ hasLocalData }) {
  return (
    <div className="light-tab" style={{ maxWidth: 460, margin: '0 auto', padding: '56px 18px', textAlign: 'center' }}>
      <h1>To The Cent</h1>
      <div className="sub" style={{ marginTop: 8 }}>Sign in to see your budget and your business - the same on your phone and your computer, always up to date.</div>
      {hasLocalData && (
        <div className="infobox" style={{ marginTop: 18, textAlign: 'left' }}>
          <b>Your budget on this device is safe.</b> Sign in (or create an account) and it will be saved to your account automatically.
        </div>
      )}
      <div style={{ height: 22 }} />
      <a className="b" href="/?auth=signin" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>Log in</a>
      <div style={{ height: 10 }} />
      <a className="b g" href="/?auth=signup" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', padding: 15, borderRadius: 999, fontWeight: 700 }}>Create an account</a>
      <div className="mini" style={{ marginTop: 16 }}>We never ask for your online banking login.</div>
    </div>
  );
}
