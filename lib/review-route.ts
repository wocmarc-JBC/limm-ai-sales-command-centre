export const REVIEW_ROUTE_FLAG = "NEXT_PUBLIC_ENABLE_REVIEW_ROUTE";

export function isReviewRouteEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_REVIEW_ROUTE === "true";
}
