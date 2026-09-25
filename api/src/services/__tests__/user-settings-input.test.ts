import "reflect-metadata";
import { Arg, buildSchema, Mutation, Query, Resolver } from "type-graphql";
import { graphql } from "graphql";
import { UserSettings } from "@/entities/User";

let received: Partial<UserSettings> | undefined;

@Resolver()
class SettingsResolver {
  @Query(() => String)
  ping() {
    return "pong";
  }

  @Mutation(() => String)
  saveSettings(@Arg("settings", () => UserSettings) settings: UserSettings) {
    received = { ...settings };
    return "ok";
  }
}

describe("UserSettingsInput", () => {
  it("carries only the settings the client sent, so saving one leaves the others as they are", async () => {
    const schema = await buildSchema({ resolvers: [SettingsResolver], validate: false });
    const result = await graphql({
      schema,
      source: `mutation { saveSettings(settings: { mcpToolApprovals: false }) }`,
    });

    expect(result.errors).toBeUndefined();
    expect(received).toEqual({ mcpToolApprovals: false });
  });
});
