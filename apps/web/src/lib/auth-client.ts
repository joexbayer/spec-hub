import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({ baseURL: window.location.origin })

export const signInWithGitHub = () =>
  authClient.signIn.social({
    provider: 'github',
    callbackURL: '/',
    // Better Auth appends ?error=<code>
    errorCallbackURL: '/sign-in',
  })

export const signOut = () => authClient.signOut()
