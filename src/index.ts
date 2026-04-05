import express from "express";

let appPromise: Promise<ReturnType<typeof express>> | undefined;

async function getApp() {
  if (!appPromise) {
    appPromise = import("../packages/server/src/index.js").then(({ createApp }) => createApp());
  }

  return appPromise;
}

export default async function handler(
  request: Parameters<ReturnType<typeof express>>[0],
  response: Parameters<ReturnType<typeof express>>[1]
) {
  const app = await getApp();
  return app(request, response);
}
