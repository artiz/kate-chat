/** Sent by a skill block's own Run button (useCodePlugins) to the card that runs the block (SkillRuns) */
export const SKILL_RUN_EVENT = "katechat:skill-run";

export interface SkillRunRequest {
  messageId: string;
  /** The block's position among the message's complete skill blocks */
  index: number;
}
