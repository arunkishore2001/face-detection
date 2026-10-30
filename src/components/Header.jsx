import { googleConfigured } from "../lib/google.js";

export default function Header({ account, onSignIn, onSignOut, onReset }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="9" r="4" fill="currentColor" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" /></svg>
        </span>
        <span className="brand-name">Face Sorter</span>
      </div>
      <div className="header-actions">
        <button className="btn btn-ghost" onClick={onReset}>↺ Start over</button>
        {account ? (
          <div className="account">
            {account.photo
              ? <img src={account.photo} alt="" className="avatar" referrerPolicy="no-referrer" />
              : <span className="avatar">{(account.name || account.email)[0]}</span>}
            <span className="account-email">{account.email}</span>
            <button className="btn btn-link" onClick={onSignOut}>Sign out</button>
          </div>
        ) : googleConfigured && (
          <button className="btn btn-secondary" onClick={onSignIn}>Sign in with Google</button>
        )}
      </div>
    </header>
  );
}
