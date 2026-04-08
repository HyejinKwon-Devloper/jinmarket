import { expect, test, type Locator, type Page } from "@playwright/test";

async function getBox(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  return box!;
}

async function openSetupWithSampleData(page: Page) {
  await page.goto("/random-game");
  await expect(page.getByTestId("start-screen")).toBeVisible();
  await page.getByTestId("start-load-sample").click();
  await expect(page.getByTestId("setup-screen")).toBeVisible();
}

function visibleByTestId(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"]:visible`);
}

async function goToDrawPanel(page: Page) {
  await expect(page.getByTestId("setup-panel-participants")).toBeVisible();
  await page.getByTestId("setup-next-button").click();
  await expect(page.getByTestId("setup-panel-draw")).toBeVisible();
}

async function goToReviewPanel(page: Page) {
  await goToDrawPanel(page);
  await page.getByTestId("setup-next-button").click();
  await expect(page.getByTestId("setup-panel-review")).toBeVisible();
}

test.describe("random-game mobile flow", () => {
  test("setup panels unmount when moving between mobile steps", async ({
    page,
  }) => {
    await openSetupWithSampleData(page);

    await expect(page.getByTestId("setup-panel-participants")).toBeVisible();
    await expect(page.getByTestId("setup-panel-draw")).toHaveCount(0);
    await expect(page.getByTestId("setup-panel-review")).toHaveCount(0);

    await page.getByTestId("setup-next-button").click();
    await expect(page.getByTestId("setup-panel-participants")).toHaveCount(0);
    await expect(page.getByTestId("setup-panel-draw")).toBeVisible();

    await page.getByTestId("setup-next-button").click();
    await expect(page.getByTestId("setup-panel-draw")).toHaveCount(0);
    await expect(page.getByTestId("setup-panel-review")).toBeVisible();

    await page.getByTestId("setup-review-back-button").click();
    await expect(page.getByTestId("setup-panel-review")).toHaveCount(0);
    await expect(page.getByTestId("setup-panel-draw")).toBeVisible();
  });

  test("game screen keeps mobile cards in vertical order without overlap", async ({
    page,
  }) => {
    await openSetupWithSampleData(page);
    await goToReviewPanel(page);

    await visibleByTestId(page, "setup-prepare-button").scrollIntoViewIfNeeded();
    await visibleByTestId(page, "setup-prepare-button").click();

    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(visibleByTestId(page, "game-canvas")).toBeVisible();
    await expect(page.getByText("Arcade Winner Game")).toHaveCount(0);

    const boardBox = await getBox(visibleByTestId(page, "game-board-card"));
    const missionBox = await getBox(visibleByTestId(page, "game-mission-card"));
    const controlsBox = await getBox(
      visibleByTestId(page, "game-controls-card"),
    );
    const actionsBox = await getBox(
      visibleByTestId(page, "game-action-buttons"),
    );

    expect(boardBox.height).toBeGreaterThan(420);
    expect(boardBox.y + boardBox.height).toBeLessThanOrEqual(missionBox.y + 1);
    expect(missionBox.y + missionBox.height).toBeLessThanOrEqual(
      controlsBox.y + 1,
    );
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(
      actionsBox.y + 1,
    );
  });

  test("instant reveal keeps result stage and winner list separated on mobile", async ({
    page,
  }) => {
    await openSetupWithSampleData(page);
    await goToDrawPanel(page);

    await visibleByTestId(page, "setup-reveal-visible").click();
    await page.getByTestId("setup-next-button").click();
    await expect(page.getByTestId("setup-panel-review")).toBeVisible();

    await visibleByTestId(page, "setup-prepare-button").scrollIntoViewIfNeeded();
    await visibleByTestId(page, "setup-prepare-button").click();

    await expect(page.getByTestId("result-screen")).toBeVisible();
    await expect(visibleByTestId(page, "result-center-card")).toBeVisible();
    await expect(visibleByTestId(page, "result-winner-list")).toBeVisible({
      timeout: 12_000,
    });

    const stageBox = await getBox(visibleByTestId(page, "result-stage-card"));
    const listBox = await getBox(visibleByTestId(page, "result-winner-list"));
    const summaryBox = await getBox(
      visibleByTestId(page, "result-summary-card"),
    );
    const sequenceBox = await getBox(
      visibleByTestId(page, "result-sequence-card"),
    );
    const actionsBox = await getBox(
      visibleByTestId(page, "result-action-buttons"),
    );

    expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(listBox.y + 1);
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(summaryBox.y + 1);
    expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(
      sequenceBox.y + 1,
    );
    expect(sequenceBox.y + sequenceBox.height).toBeLessThanOrEqual(
      actionsBox.y + 1,
    );
  });
});
