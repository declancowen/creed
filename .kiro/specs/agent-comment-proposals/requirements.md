# Requirements Document

## Introduction

This feature lets connected agents (via MCP only) add comments to a shared Creed
document on the user's behalf. An agent-created comment does not appear as a
normal comment. Instead it lands as a private pending proposal that is visible
only to the user whose token the agent authenticated with (the Proposer). The
Proposer reviews the pending comment locally in the document editor and approves
it. Approval publishes the comment as a normal comment authored by that user; it
is never labeled as an agent comment to anyone. Other workspace members only
ever see the comment after it is approved (shared); they have no acceptance step.

The feature reuses the existing proposal PATTERN but not the
`creed_document_proposals` table. It extends the existing
`creed_document_comments` table with a `proposal_status` column and an agent
label column, so a pending agent comment behaves exactly like a normal comment
(one-level replies, @display-name mentions, open/resolved status after approval,
and `reference_quote` inline anchoring) while remaining private to the Proposer
until approved.

The central concern is leak prevention: pending agent comments must not notify
mentioned users, must not emit workspace-visible activity, and must not appear on
any comment read path for anyone except the Proposer, until they are approved.

## Glossary

- **Shared_Document**: A Markdown document in the Supabase-backed Creed
  workspace, represented by a row in `creed_documents`.
- **Comment_Store**: The server-side application layer that reads and writes
  `creed_document_comments`, primarily the functions `listDocumentComments` and
  the new `listPendingCommentsForUser`.
- **MCP_Comment_Tool**: The existing MCP tools `creed_create_document_comment`
  and `creed_reply_to_document_comment`, extended by this feature.
- **Document_Read_Path**: Any code path that returns comments to a caller,
  including the shared-document editor load, the MCP `creed_read_document` tool,
  and the MCP `creed_list_document_comments` tool.
- **Proposer**: The Creed user whose authentication token the agent used when
  invoking the MCP_Comment_Tool. Identified by the token's `userId`. This is the
  approver, and is NOT the document owner.
- **Pending_Comment**: A row in `creed_document_comments` with
  `proposal_status = 'pending'`. Created by an agent, visible only to the
  Proposer, and not yet published to the workspace.
- **Shared_Comment**: A row in `creed_document_comments` with
  `proposal_status = 'shared'`. A normal, workspace-visible comment.
- **Document_Editor**: The signed-in editor UI (`components/creed/file-screen.tsx`
  and its comment sidebar) where a Proposer reviews and approves Pending_Comments.
- **Notification_Service**: The mention notification and email delivery path in
  `lib/document-collaboration.ts` (`creed_notifications` rows plus
  `deliverPendingMentionEmails`).
- **Activity_Log**: Workspace-visible document activity events stored in
  `creed_document_activity_events` and surfaced via `listDocumentActivity`.
- **Agent_Contract**: The collaboration rules shipped to every connected agent on
  every read, defined in `lib/creed-data.ts:collaborationRules`.
- **proposal_status**: New `text` column on `creed_document_comments`, default
  `'shared'`, with allowed values `'pending'` and `'shared'`. Orthogonal to the
  existing `status` (`open`/`resolved`) column.
- **proposed_by_agent_label**: New nullable `text` column on
  `creed_document_comments` recording the agent label for a Pending_Comment,
  shown only in the Proposer's private pending view.

## Requirements

### Requirement 1: Agent comments are created as private pending proposals

**User Story:** As a Proposer, I want an agent's comment to arrive as a private
pending proposal, so that I can review it before anyone else sees it.

#### Acceptance Criteria

1. WHEN the MCP_Comment_Tool creates a comment, THE Comment_Store SHALL set `proposal_status` to `'pending'` on the new comment row.
2. WHEN the MCP_Comment_Tool creates a comment, THE Comment_Store SHALL set `created_by` to the Proposer's user id at creation time.
3. WHEN the MCP_Comment_Tool creates a comment, THE Comment_Store SHALL set `proposed_by_agent_label` to the agent label supplied for the invocation.
4. WHEN the MCP_Comment_Tool creates a comment, THE Comment_Store SHALL set `status` to `'open'`.
5. IF a comment creation is requested through the Document_Editor by a user who is not signed in, THEN THE Comment_Store SHALL reject the comment creation.
6. WHERE a comment is created through the Document_Editor by a signed-in user, THE Comment_Store SHALL set `proposal_status` to `'shared'` regardless of any other condition.

### Requirement 2: Comment schema extension

**User Story:** As a maintainer, I want the pending concept stored on the
existing comments table, so that pending comments reuse the full comment model
without a separate proposals table.

#### Acceptance Criteria

1. THE Comment_Store SHALL persist a `proposal_status` column on `creed_document_comments` that is `text`, `not null`, and defaults to `'shared'`.
2. THE Comment_Store SHALL restrict `proposal_status` values to `'pending'` and `'shared'`.
3. THE Comment_Store SHALL persist a nullable `proposed_by_agent_label` `text` column on `creed_document_comments`.
4. THE Comment_Store SHALL keep the existing `status` column values `'open'` and `'resolved'` unchanged and independent of `proposal_status`.
5. WHERE the row-level security policy on `creed_document_comments` is evaluated, THE Comment_Store SHALL keep the existing `using(true)` backstop consistent with the existing tables and enforce Proposer-only visibility of Pending_Comments in the application layer.

### Requirement 3: Approval publishes the comment as the Proposer's own

**User Story:** As a Proposer, I want approving a pending comment to publish it as
a normal comment authored by me, so that the workspace sees a genuine comment and
never an agent label.

#### Acceptance Criteria

1. WHEN the Proposer approves a Pending_Comment, THE Comment_Store SHALL set `proposal_status` to `'shared'` on that comment row.
2. WHEN the Proposer approves a Pending_Comment, THE Comment_Store SHALL leave `created_by` unchanged so authorship remains the Proposer.
3. WHEN the Proposer approves a Pending_Comment, THE Comment_Store SHALL exclude `proposed_by_agent_label` from the Shared_Comment presented to workspace members.
4. THE Comment_Store SHALL treat approval as the single publishing action and SHALL NOT require a separate share action.
5. IF a caller other than the Proposer attempts to approve a Pending_Comment, THEN THE Comment_Store SHALL reject the request with a forbidden error before processing any comment updates.

### Requirement 4: Rejection hard-deletes the pending comment

**User Story:** As a Proposer, I want rejecting a pending comment to remove it
entirely, so that a comment I declined never becomes a real comment.

#### Acceptance Criteria

1. WHEN the Proposer rejects a Pending_Comment, THE Comment_Store SHALL delete the comment row from `creed_document_comments`.
2. WHEN the Proposer rejects a Pending_Comment that has replies, THE Comment_Store SHALL delete the reply rows attached to that Pending_Comment.
3. WHEN the Proposer rejects a Pending_Comment, THE Comment_Store SHALL NOT write any Activity_Log event for that comment (a rejected Pending_Comment leaves no activity trace, workspace-visible or otherwise).
4. IF a caller other than the Proposer attempts to reject a Pending_Comment, THEN THE Comment_Store SHALL reject the request with a forbidden error before deleting anything.

### Requirement 5: The Proposer is the approver

**User Story:** As a Proposer, I want to be the one who approves the agent's
comment, so that control follows the token used, not the document owner.

#### Acceptance Criteria

1. THE Comment_Store SHALL treat the token's user as the Proposer and approver for a Pending_Comment.
2. WHEN determining who may approve or reject a Pending_Comment, THE Comment_Store SHALL compare the acting user's id to the Pending_Comment `created_by` value.
3. WHERE the document owner is a different user from the Proposer, THE Comment_Store SHALL NOT grant the document owner approval or rejection rights over the Pending_Comment.

### Requirement 6: Read paths exclude pending comments from everyone but the Proposer

**User Story:** As a workspace member, I want to never see another user's pending
agent comments, so that private proposals stay private until approved.

#### Acceptance Criteria

1. WHEN `listDocumentComments` returns comments for a caller, THE Comment_Store SHALL exclude all rows where `proposal_status = 'pending'`, including the caller's own Pending_Comments.
2. THE Comment_Store SHALL provide a separate `listPendingCommentsForUser` function that returns Pending_Comments only where `created_by` equals the requesting user's id, so a Proposer retrieves their own Pending_Comments only through this function.
3. WHEN the Document_Read_Path serves the shared-document editor load, THE Comment_Store SHALL exclude Pending_Comments that do not belong to the requesting user at the data-retrieval layer without relying on UI-layer hiding.
4. WHEN the MCP `creed_read_document` tool returns comments, THE Comment_Store SHALL exclude Pending_Comments that do not belong to the token's user.
5. WHEN the MCP `creed_list_document_comments` tool returns comments, THE Comment_Store SHALL exclude Pending_Comments that do not belong to the token's user.
6. THE Comment_Store SHALL centralize pending-exclusion logic in `listDocumentComments` and Proposer-scoped retrieval in `listPendingCommentsForUser`.

### Requirement 7: Mention notifications and emails are deferred until approval

**User Story:** As a mentioned user, I want to be notified only about comments
that have been approved, so that a pending agent comment cannot alert me
prematurely.

#### Acceptance Criteria

1. WHEN a Pending_Comment @mentions a user, THE Notification_Service SHALL NOT create a `creed_notifications` row for that mention while `proposal_status = 'pending'`.
2. WHEN a Pending_Comment @mentions a user, THE Notification_Service SHALL NOT send a mention email while `proposal_status = 'pending'`.
3. WHEN the Proposer approves a Pending_Comment that @mentions a user, THE Notification_Service SHALL create the mention notification for that user.
4. WHEN the Proposer approves a Pending_Comment that @mentions a user, THE Notification_Service SHALL deliver the mention email for that user WHERE mention email delivery is configured.
5. WHEN the Proposer rejects a Pending_Comment, THE Notification_Service SHALL NOT create any mention notification or send any mention email for that comment.

### Requirement 8: Workspace-visible activity is deferred until approval

**User Story:** As a workspace member, I want the activity feed to reflect only
approved comments, so that pending proposals leave no workspace-visible trace.

#### Acceptance Criteria

1. WHEN a Pending_Comment is created, THE Activity_Log SHALL NOT write any activity event for that comment, workspace-visible or otherwise (no event is recorded at creation; the event is written on approval).
2. WHEN the Proposer approves a Pending_Comment, THE Activity_Log SHALL record a workspace-visible comment activity event for the newly Shared_Comment.
3. WHILE a comment has `proposal_status = 'pending'`, THE Activity_Log SHALL contain no activity events for that comment.

### Requirement 9: Surfacing pending comments to the Proposer

**User Story:** As a Proposer, I want to see my agent's pending comments both at
their anchor and in a grouped list, so that I can review each one in context.

#### Acceptance Criteria

1. WHERE a Pending_Comment has a `reference_quote` anchor, THE Document_Editor SHALL render an inline pending marker at the comment's text anchor for the Proposer.
2. THE Document_Editor SHALL render a grouped "pending from your agent" section in the comment sidebar for the Proposer.
3. WHEN the Document_Editor renders comments for a user who is not the Proposer of a Pending_Comment, THE Document_Editor SHALL NOT render that Pending_Comment inline at any text anchor.
4. WHEN the Document_Editor renders comments for a user who is not the Proposer of a Pending_Comment, THE Document_Editor SHALL NOT render that Pending_Comment in the comment sidebar.
5. WHEN the Document_Editor displays a Pending_Comment to the Proposer, THE Document_Editor SHALL display the `proposed_by_agent_label` value.
6. THE Document_Editor SHALL present an approve action and a reject action for each Pending_Comment shown to the Proposer.

### Requirement 10: Pending comments fit the existing comment model

**User Story:** As a Proposer, I want a pending agent comment to support the same
capabilities as any other comment, so that approval yields a fully normal
comment.

#### Acceptance Criteria

1. THE Comment_Store SHALL allow a Pending_Comment to have one level of replies, consistent with the existing parent-reply threading rule.
2. THE Comment_Store SHALL support @display-name mentions within a Pending_Comment body, deferring notification per Requirement 7.
3. WHERE a comment has `proposal_status = 'shared'`, THE Comment_Store SHALL allow a transition of that comment's `status` to `'open'`.
4. WHERE a comment has `proposal_status = 'shared'`, THE Comment_Store SHALL allow a transition of that comment's `status` to `'resolved'`.
5. THE Document_Editor SHALL apply `reference_quote` inline anchoring and highlighting to a Pending_Comment for the Proposer.

### Requirement 11: MCP tool reports the proposal outcome

**User Story:** As a connected agent, I want the tool result to tell me the
comment was recorded as a pending proposal, so that I do not assume it was
published.

#### Acceptance Criteria

1. WHEN the MCP_Comment_Tool creates an agent comment, THE MCP_Comment_Tool SHALL return an `outcome` value indicating the comment was recorded as a pending proposal.
2. THE MCP_Comment_Tool SHALL describe the approve-then-share lifecycle in its tool description.
3. WHEN the MCP_Comment_Tool creates a Pending_Comment, THE MCP_Comment_Tool SHALL NOT return notification records that would imply mentioned users were notified.
4. WHEN the MCP_Comment_Tool successfully creates a Pending_Comment, THE Comment_Store SHALL keep the Pending_Comment persisted regardless of whether the outcome result is delivered to the agent; the `outcome` value is informational and SHALL NOT trigger a rollback of a successful comment creation.
5. THE Comment_Store SHALL continue to create agent comments only through MCP and SHALL NOT add a token-authenticated `/api/creed/*` comment endpoint in this scope.

### Requirement 12: Documentation and contract updates

**User Story:** As a maintainer, I want the agent-facing docs and contract to
describe this capability, so that connected agents understand the pending-comment
workflow.

#### Acceptance Criteria

1. THE Agent_Contract SHALL document that agent comments are created as private pending proposals that the Proposer approves before the comment is shared.
2. THE maintainer SHALL complete verification of the Agent_Contract change across at least two models before the Agent_Contract change in `lib/creed-data.ts:collaborationRules` is committed.
3. THE maintainer SHALL update `AGENTS.md` to document the pending-comment capability and the agent workflow, treating `AGENTS.md` as canonical because there is no `CLAUDE.md`.
4. THE maintainer SHALL update the MCP comment tool description(s) to reflect the pending-proposal creation and the approve-then-share lifecycle.
