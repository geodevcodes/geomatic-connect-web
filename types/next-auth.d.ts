import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    _id: string;
    role: string;
    email: string;
    token: string;
    refreshToken: string;
    expiresIn?: number;
    accessTokenExpires?: number;
    picture?: string;
  }

  interface Session {
    user: {
      _id: string;
      role: string;
      email: string;
      // Backend access token.
      token: string;
      // Access token expiration timestamp.
      accessTokenExpires: number;
    } & DefaultSession["user"];
    error?: "RefreshAccessTokenError";
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    _id?: string;
    email?: string;
    role?: string;
    // Backend access token.
    token?: string;
    // Backend refresh token.
    refreshToken?: string;
    // Access token expiration timestamp.
    accessTokenExpires?: number;
    error?: "RefreshAccessTokenError";
  }
}
