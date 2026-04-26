const { decodeContentBase64 } = require("../agentPayloads");
const { STARTER_TEMPLATES } = require("../starterTemplates");

function templateByKey(templateKey: string) {
  return STARTER_TEMPLATES.find((template) => template.templateKey === templateKey);
}

function filePathsFor(templateKey: string) {
  return (templateByKey(templateKey)?.payload?.files || []).map((file) => file.path);
}

function decodedFilesFor(templateKey: string) {
  return (templateByKey(templateKey)?.payload?.files || []).map((file) => ({
    path: file.path,
    content: decodeContentBase64(file.contentBase64),
  }));
}

describe("STARTER_TEMPLATES", () => {
  it("includes the iris instagram preset with its brand docs", () => {
    const template = templateByKey("iris-instagram");

    expect(template).toBeTruthy();
    expect(template.name).toBe("Iris Instagram Manager");
    expect(filePathsFor("iris-instagram")).toEqual(
      expect.arrayContaining([
        "SOUL.md",
        "TOOLS.md",
        "HEARTBEAT.md",
        "BOOTSTRAP.md",
        "BRAND.md",
        "README.md",
      ]),
    );
    expect(filePathsFor("iris-instagram")).not.toContain("manifest.json");
    expect(filePathsFor("iris-instagram")).not.toContain("openclaw.json");
    expect(filePathsFor("iris-instagram")).not.toContain("iris-instagram.zip");

    const brandFile = template.payload.files.find((file) => file.path === "BRAND.md");
    expect(decodeContentBase64(brandFile.contentBase64)).toContain(
      "# BRAND.md — The Account Iris Manages",
    );
  });

  it("includes the personal branding preset with bootstrap and voice files", () => {
    const template = templateByKey("personal-branding");

    expect(template).toBeTruthy();
    expect(template.name).toBe("Echo Personal Branding");
    expect(filePathsFor("personal-branding")).toEqual(
      expect.arrayContaining([
        "SOUL.md",
        "TOOLS.md",
        "BOOTSTRAP.md",
        "PROFILE.md",
        "VOICE.md",
        "PLATFORMS.md",
        "README.md",
      ]),
    );
    expect(filePathsFor("personal-branding")).not.toContain("manifest.json");
    expect(filePathsFor("personal-branding")).not.toContain("openclaw.json");
    expect(filePathsFor("personal-branding")).not.toContain("echo-personal-brand.zip");

    const voiceFile = template.payload.files.find((file) => file.path === "VOICE.md");
    expect(decodeContentBase64(voiceFile.contentBase64)).toContain(
      "# VOICE.md — How the Operator Sounds",
    );
  });

  it("keeps Agent Hub template credentials sourced from integrations", () => {
    const disallowedCredentialSetup = [
      ".env",
      "ANTHROPIC_API_KEY",
      "TELEGRAM_BOT_TOKEN",
      "OPERATOR_TELEGRAM_ID",
      "INSTAGRAM_ACCESS_TOKEN",
      "INSTAGRAM_BUSINESS_ACCOUNT_ID",
      "sk-ant-",
      "Write to",
      "Paste the token here",
    ];

    for (const template of STARTER_TEMPLATES) {
      for (const file of decodedFilesFor(template.templateKey)) {
        for (const disallowed of disallowedCredentialSetup) {
          if (file.content.includes(disallowed)) {
            throw new Error(
              `${template.templateKey}/${file.path} contains disallowed credential setup: ${disallowed}`,
            );
          }
        }
      }
    }
  });
});
