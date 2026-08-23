import { describe, expect, it } from "vitest";

import { guessImportPlaceIcon } from "./placeIconGuess";

describe("guessImportPlaceIcon", () => {
  it("maps meal titles to food", () => {
    for (const title of ["朝食", "昼食", "夕食"]) {
      expect(
        guessImportPlaceIcon({
          category: null,
          eventTitle: title,
          merchant: null,
        }),
      ).toBe("food");
    }
  });

  it("maps カフェ title to cafe", () => {
    expect(
      guessImportPlaceIcon({
        category: null,
        eventTitle: "カフェ",
        merchant: null,
      }),
    ).toBe("cafe");
  });

  it("maps バー title to bar", () => {
    expect(
      guessImportPlaceIcon({
        category: null,
        eventTitle: "バー",
        merchant: null,
      }),
    ).toBe("bar");
  });

  it("maps 観光 title to sightseeing", () => {
    expect(
      guessImportPlaceIcon({
        category: null,
        eventTitle: "観光",
        merchant: null,
      }),
    ).toBe("sightseeing");
  });

  it("maps 買い物 title to shopping by default", () => {
    expect(
      guessImportPlaceIcon({
        category: null,
        eventTitle: "買い物",
        merchant: "Yard House Store",
      }),
    ).toBe("shopping");
  });

  it("maps 買い物 title with grocery keyword to local_grocery_store", () => {
    expect(
      guessImportPlaceIcon({
        category: null,
        eventTitle: "買い物",
        merchant: "Foodland Supermarket",
      }),
    ).toBe("local_grocery_store");
  });

  it("falls back to receipt category when no event title", () => {
    expect(
      guessImportPlaceIcon({
        category: "飲食",
        eventTitle: null,
        merchant: "Yard House",
      }),
    ).toBe("food");
    expect(
      guessImportPlaceIcon({
        category: "土産",
        eventTitle: null,
        merchant: null,
      }),
    ).toBe("shopping");
    expect(
      guessImportPlaceIcon({
        category: "エンタメ",
        eventTitle: null,
        merchant: null,
      }),
    ).toBe("activity");
    expect(
      guessImportPlaceIcon({
        category: "カジノ",
        eventTitle: null,
        merchant: null,
      }),
    ).toBe("casino");
    expect(
      guessImportPlaceIcon({
        category: "宿泊",
        eventTitle: null,
        merchant: null,
      }),
    ).toBe("lodging");
    expect(
      guessImportPlaceIcon({
        category: "医療",
        eventTitle: null,
        merchant: null,
      }),
    ).toBe("local_hospital");
  });

  it("detects bar/cafe keywords in merchant for 飲食 category", () => {
    expect(
      guessImportPlaceIcon({
        category: "飲食",
        eventTitle: null,
        merchant: "Aloha Beach Bar",
      }),
    ).toBe("bar");
    expect(
      guessImportPlaceIcon({
        category: "飲食",
        eventTitle: null,
        merchant: "Blue Bottle Coffee",
      }),
    ).toBe("cafe");
  });

  it("returns null for unmapped categories", () => {
    expect(
      guessImportPlaceIcon({
        category: "通信",
        eventTitle: null,
        merchant: null,
      }),
    ).toBeNull();
    expect(
      guessImportPlaceIcon({
        category: null,
        eventTitle: null,
        merchant: null,
      }),
    ).toBeNull();
  });
});
