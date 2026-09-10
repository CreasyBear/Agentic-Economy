export {}

declare global {
  interface CustomJwtSessionClaims {
    reverification_id?: string
  }
}
