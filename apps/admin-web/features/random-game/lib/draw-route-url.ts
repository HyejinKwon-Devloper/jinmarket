type BuildEventDrawSourceUrlOptions = {
  requestUrl: string | URL;
  eventId: string;
  apiBaseUrl: string;
  preferSameOriginProxy: boolean;
};

export function buildEventDrawSourceUrl({
  requestUrl,
  eventId,
  apiBaseUrl,
  preferSameOriginProxy,
}: BuildEventDrawSourceUrlOptions) {
  const encodedEventId = encodeURIComponent(eventId);

  if (preferSameOriginProxy) {
    return new URL(`/api/admin/events/${encodedEventId}/draw-source`, requestUrl);
  }

  return new URL(
    `${apiBaseUrl.replace(/\/+$/, "")}/admin/events/${encodedEventId}/draw-source`,
  );
}
