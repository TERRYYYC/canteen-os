/** One app-owned reader for legacy sheets and explicitly identified team publications. */
import { createPublishedData } from './view-models/published';
export { DataError, PublishedDataError, publicationKey } from './view-models/published';
export type { Publication, LegacyPublication, TeamPublication, TeamPublishedManifest, PublishedTeamPlan, PublishedIssue, PublishedAsset } from './view-models/published';

export const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
export const dataUrl = {
  build: (): string => `${DATA_BASE}build.json`,
  prep: (planId: string): string => `${DATA_BASE}prep/${encodeURIComponent(planId)}.json`,
  purchase: (planId: string): string => `${DATA_BASE}purchase/${encodeURIComponent(planId)}.json`,
  menu: (planId: string): string => `${DATA_BASE}menu/${encodeURIComponent(planId)}.json`,
};
export const dataApi = createPublishedData({ baseUrl: new URL(DATA_BASE, document.baseURI).href });
export const { loadBuild, loadPrep, loadPurchase, loadMenu, clearCache, loadPublication, loadPublishedTeamPlan, loadPublishedAsset } = dataApi;
export type DataApi = typeof dataApi;
