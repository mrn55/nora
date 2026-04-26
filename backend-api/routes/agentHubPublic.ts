// @ts-nocheck
const express = require("express");
const marketplace = require("../marketplace");
const snapshots = require("../snapshots");
const { scanTemplatePayloadForSecrets } = require("../marketplaceSafety");
const {
  extractTemplateDefaultsFromSnapshot,
  extractTemplatePayloadFromSnapshot,
  summarizeTemplatePayload,
} = require("../agentPayloads");

const router = express.Router();

function normalizeText(value, fallback = "", maxLength = 255) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (normalized || fallback).slice(0, maxLength);
}

function normalizeDescription(value, fallback = "", maxLength = 1200) {
  if (typeof value !== "string") return String(fallback || "").slice(0, maxLength);
  return value.trim().slice(0, maxLength);
}

function normalizeCategory(value) {
  return normalizeText(value, "General", 60) || "General";
}

function buildCatalogListing(listing, snapshot = null, templatePayload = null) {
  const template = templatePayload
    ? summarizeTemplatePayload(templatePayload, { includeContent: false })
    : null;

  return {
    id: listing.id,
    slug: listing.slug,
    name: listing.name,
    description: listing.description,
    category: listing.category,
    price: listing.price || "Free",
    source_type: "community",
    status: listing.status,
    ownerName: listing.owner_name || listing.owner_email || "Nora Community",
    current_version: listing.current_version || 1,
    installs: listing.installs || 0,
    downloads: listing.downloads || 0,
    defaults: snapshot ? extractTemplateDefaultsFromSnapshot(snapshot) : null,
    snapshot: snapshot
      ? {
          id: snapshot.id,
          kind: snapshot.kind,
          templateKey: snapshot.template_key || null,
        }
      : null,
    template: template
      ? {
          fileCount: template.fileCount,
          memoryFileCount: template.memoryFileCount,
          integrationCount: template.integrationCount,
          channelCount: template.channelCount,
          requiredCoreCount: template.requiredCoreCount,
          presentRequiredCoreCount: template.presentRequiredCoreCount,
          missingRequiredCoreFiles: template.missingRequiredCoreFiles,
          hasBootstrap: template.hasBootstrap,
          extraFilesCount: template.extraFilesCount,
          coreFiles: template.coreFiles.map((file) => ({
            path: file.path,
            label: file.label,
            required: file.required,
            present: file.present,
            bytes: file.bytes,
            lineCount: file.lineCount,
            preview: file.preview,
          })),
        }
      : null,
  };
}

async function buildCatalogDetail(listing, { includeContent = false } = {}) {
  const snapshot = listing?.snapshot_id ? await snapshots.getSnapshot(listing.snapshot_id) : null;
  const templatePayload = snapshot
    ? extractTemplatePayloadFromSnapshot(snapshot, { includeBootstrap: true })
    : null;
  const summary = buildCatalogListing(listing, snapshot, templatePayload);
  if (!includeContent || !templatePayload) return summary;

  return {
    ...summary,
    defaults: snapshot ? extractTemplateDefaultsFromSnapshot(snapshot) : {},
    templatePayload,
    template: summarizeTemplatePayload(templatePayload, { includeContent: true }),
  };
}

router.get("/catalog", async (_req, res, next) => {
  try {
    const listings = await marketplace.listCommunityCatalog();
    const items = await Promise.all(listings.map((listing) => buildCatalogDetail(listing)));
    res.json({
      hub: {
        name: "Nora Agent Hub",
      },
      items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/catalog/:id", async (req, res, next) => {
  try {
    const listing = await marketplace.getListing(req.params.id);
    if (
      !listing ||
      listing.source_type !== marketplace.LISTING_SOURCE_COMMUNITY ||
      listing.status !== marketplace.LISTING_STATUS_PUBLISHED ||
      ![marketplace.LISTING_SHARE_TARGET_COMMUNITY, marketplace.LISTING_SHARE_TARGET_BOTH].includes(
        listing.share_target,
      )
    ) {
      return res.status(404).json({ error: "Listing not found" });
    }
    res.json(await buildCatalogDetail(listing, { includeContent: true }));
  } catch (error) {
    next(error);
  }
});

router.post("/submissions", async (req, res, next) => {
  try {
    const payload = req.body || {};
    const listingPayload = payload.listing || payload;
    const templatePayload = payload.templatePayload || payload.template_payload || {};
    const issues = scanTemplatePayloadForSecrets(templatePayload);
    if (issues.length > 0) {
      return res.status(400).json({
        error: "Potential secrets were detected in this template. Remove them before sharing.",
        issues,
      });
    }

    const name = normalizeText(listingPayload.name, "Community Template", 100);
    const description = normalizeDescription(listingPayload.description);
    const category = normalizeCategory(listingPayload.category);
    const snapshot = await snapshots.createSnapshot(
      null,
      name,
      description,
      {
        kind: "community-template",
        defaults: payload.defaults || {},
        templatePayload,
      },
      {
        kind: "community-template",
        builtIn: false,
        templateKey: payload.snapshot?.templateKey || payload.snapshot?.template_key || null,
      },
    );
    const listing = await marketplace.upsertListing({
      snapshotId: snapshot.id,
      ownerUserId: null,
      name,
      description,
      price: "Free",
      category,
      builtIn: false,
      sourceType: marketplace.LISTING_SOURCE_COMMUNITY,
      status: marketplace.LISTING_STATUS_PENDING_REVIEW,
      visibility: marketplace.LISTING_VISIBILITY_PUBLIC,
      shareTarget: marketplace.LISTING_SHARE_TARGET_COMMUNITY,
      localVisibility: marketplace.LISTING_LOCAL_VISIBILITY_OWNER,
      centralShareStatus: marketplace.CENTRAL_SHARE_STATUS_SUBMITTED,
      cloneMode: "files_only",
    });

    res.status(202).json({
      id: listing.id,
      listingId: listing.id,
      status: listing.status,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
