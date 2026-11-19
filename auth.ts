import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import NextAuth from "next-auth";
import axios from "axios";

/* -----------------------------
   Constants
----------------------------- */

// Backend access token expires after 15 minutes.
// const ACCESS_TOKEN_EXPIRES_IN = 15 * 60 * 1000;
const ACCESS_TOKEN_EXPIRES_IN = 60 * 1000; // 1 minute

// NextAuth session expires after 180 days.
const SESSION_MAX_AGE = 180 * 24 * 60 * 60;

/* -----------------------------
   Refresh Access Token
----------------------------- */

async function refreshAccessToken(token: any) {
  try {
    if (!token.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_BASEURL}/auth/refresh`,
      {
        refreshToken: token.refreshToken,
      },
    );

    const newAccessToken = response.data.accessToken;
    const newRefreshToken = response.data.refreshToken;

    if (!newAccessToken || !newRefreshToken) {
      throw new Error("Invalid token refresh response");
    }

    return {
      ...token,
      // Save the newly generated access token.
      token: newAccessToken,
      // IMPORTANT: Save the newly generated refresh token too.
      refreshToken: newRefreshToken,
      // Reset access token expiration to 15 minutes.
      accessTokenExpires: Date.now() + ACCESS_TOKEN_EXPIRES_IN,
      // Clear previous refresh errors.
      error: undefined,
    };
  } catch (error) {
    console.error(
      "Refresh access token error:",
      axios.isAxiosError(error) ? error.response?.data || error.message : error,
    );

    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

/* -----------------------------
   NextAuth Configuration
----------------------------- */

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },

  providers: [
    /* -----------------------------
       Credentials Login
    ----------------------------- */

    Credentials({
      name: "Credentials",

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASEURL}/auth/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(credentials),
          },
        );

        if (!response.ok) {
          return null;
        }

        const user = await response.json();
        if (!user?.data || !user?.token || !user?.refreshToken) {
          return null;
        }

        return {
          _id: user.data._id,
          email: user.data.email,
          role: user.data.role,
          token: user.token,
          refreshToken: user.refreshToken,
          // Backend returns 900 seconds.
          expiresIn: user.expiresIn ?? 900,
          accessTokenExpires: Date.now() + (user.expiresIn ?? 900) * 1000,
        };
      },
    }),

    /* -----------------------------
       Google Login
    ----------------------------- */

    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
        },
      },
    }),

    /* -----------------------------
       GitHub Login
    ----------------------------- */

    GitHub({
      clientId: process.env.NEXT_GITHUB_CLIENT_ID!,
      clientSecret: process.env.NEXT_GITHUB_CLIENT_SECRET!,
    }),
  ],

  /* -----------------------------
     Callbacks
  ----------------------------- */

  callbacks: {
    async jwt({ token, user, account, profile }) {
      /* -----------------------------
         Initial Login
      ----------------------------- */

      if (account && user) {
        // Credentials authentication
        if (account.provider === "credentials") {
          return {
            ...token,
            _id: user._id,
            role: user.role,
            email: user.email,
            token: user.token,
            refreshToken: user.refreshToken,
            accessTokenExpires:
              user.accessTokenExpires || Date.now() + ACCESS_TOKEN_EXPIRES_IN,
          };
        }

        // Google authentication
        else if (account.provider === "google") {
          const res = await axios.post(
            `${process.env.NEXT_PUBLIC_BASEURL}/auth/google-login`,
            {
              email: profile?.email,
              name: profile?.name,
              picture: profile?.picture,
              googleId: profile?.sub,
            },
          );

          if (!res.data?.token || !res.data?.refreshToken || !res.data?.data) {
            throw new Error("Invalid Google login response");
          }

          return {
            ...token,
            _id: res.data.data._id,
            email: res.data.data.email,
            role: res.data.data.role,
            token: res.data.token,
            refreshToken: res.data.refreshToken,
            accessTokenExpires: Date.now() + (res.data.expiresIn ?? 900) * 1000,
          };
        }

        // GitHub authentication
        else if (account.provider === "github") {
          const res = await axios.post(
            `${process.env.NEXT_PUBLIC_BASEURL}/auth/github-login`,
            {
              email: profile?.email,
              name: profile?.name,
              picture: profile?.picture,
              githubId: profile?.id?.toString(),
            },
          );

          if (!res.data?.token || !res.data?.refreshToken || !res.data?.data) {
            throw new Error("Invalid GitHub login response");
          }

          return {
            ...token,
            _id: res.data.data._id,
            email: res.data.data.email,
            role: res.data.data.role,
            token: res.data.token,
            refreshToken: res.data.refreshToken,
            accessTokenExpires: Date.now() + (res.data.expiresIn ?? 900) * 1000,
          };
        }
      }

      /* -----------------------------
         Check Access Token Expiration
      ----------------------------- */

      // If access token is still valid, return it.
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      /* -----------------------------
         Access Token Expired
      ----------------------------- */

      // Automatically request a new access token.
      // The refresh token is also rotated here.
      return await refreshAccessToken(token);
    },

    /* -----------------------------
       Session Callback
    ----------------------------- */

    async session({ session, token }) {
      if (session.user) {
        session.user._id = token._id!;
        session.user.email = token.email!;
        session.user.role = token.role!;
        // Expose the access token for API requests.
        session.user.token = token.token!;
        session.user.accessTokenExpires = token.accessTokenExpires!;
        // Expose refresh error so the frontend can handle it.
        session.error = token.error;
      }

      return session;
    },
  },
});
