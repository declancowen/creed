# Requirements Document

## Introduction

This feature brings review and version control to Creed's shared multi-document workspace, managed entirely within Supabase. Today edits are written directly to Supabase with no review and no history, and a separate, fragile GitHub sync exists as an attempted version-control layer. This feature removes the GitHub dependency from the document workspace and keeps all versioning and review inside Supabase.

Every edit (human or agent) becomes a workspace-shared proposal by default. Any workspace member can accept or reject any proposal. Accepting a proposal applies the change to the document and appends an immutable entry to that document's version history, which members can view, compare, and revert to. A workspace-level edit policy independently configures how humans and agents may edit: not at all, by proposal, or directly. The legacy per-section permission model from the retired single-file profile is removed from settings and replaced by this two-policy model.

Scope is the multi-document workspace only. The legacy single-file profile is out of scope. GitHub repository syncing for the document workspace (push, pull, publish, repo access) is removed.

## Glossary

- **Workspace**: The shared multi-document collaboration space whose documents live in Supabase and are read by all members.
- **Workspace_Member**: An authenticated user who belongs to the Workspace and can view its documents.
- **Document**: A Supabase-stored Markdown document in the Workspace, with content and properties.
- **Revision**: A monotonically increasing counter on a Document used for optimistic concurrency.
- **Proposal**: A workspace-shared, pending change to a Document (human- or agent-authored), stored in Supabase and visible to all Workspace_Members, that has not yet been applied.
- **Proposal_Author**: The actor (a Workspace_Member acting directly, or an agent acting on a member's behalf) that created a Proposal.
- **Human_Edit_Policy**: The workspace-level setting controlling how human actors may change Documents. One Edit_Policy_Value.
- **Agent_Edit_Policy**: The workspace-level setting controlling how agent/AI actors may change Documents. One Edit_Policy_Value.
- **Edit_Policy_Value**: One of `cant-edit` (actor cannot change Documents), `propose` (edits become Proposals requiring acceptance), or `direct` (edits apply immediately).
- **Document_Version**: An immutable snapshot recorded in a Document's Version_History when a change is applied, carrying the content, the Attribution, and a timestamp.
- **Version_History**: The append-only ordered list of Document_Versions for a Document, used to view, compare, and revert.
- **Attribution**: The recorded identity credited with a change (a Workspace_Member or a named agent), shown in the UI and stored on the Proposal and the Document_Version.
- **Settings_Page**: The workspace settings UI where the Human_Edit_Policy and Agent_Edit_Policy are configured.
- **Legacy_Section_Permission_UI**: The retired per-section permission grid (identity/goals/work/preferences/routines with per-section agentPermission) from the single-fixed-file profile.
- **Document_Toolbar**: The action toolbar in the document viewer that today contains Save, Publish document, and Pull document controls.

## Requirements

### Requirement 1: Two-Policy Workspace Edit Settings

**User Story:** As a workspace operator, I want to independently configure how humans and agents may edit documents, so that I can control the level of review and automation in the Workspace.

#### Acceptance Criteria

1. THE Settings_Page SHALL present a Human_Edit_Policy control and an Agent_Edit_Policy control as two independent workspace-level settings.
2. THE Settings_Page SHALL constrain the Human_Edit_Policy to exactly one Edit_Policy_Value from the set {`cant-edit`, `propose`, `direct`}.
3. THE Settings_Page SHALL constrain the Agent_Edit_Policy to exactly one Edit_Policy_Value from the set {`cant-edit`, `propose`, `direct`}.
4. WHERE no Human_Edit_Policy value has been configured, THE Workspace SHALL apply `propose` as the Human_Edit_Policy default.
5. WHERE no Agent_Edit_Policy value has been configured, THE Workspace SHALL apply `propose` as the Agent_Edit_Policy default.
6. WHEN a Workspace_Member saves a change to the Human_Edit_Policy or Agent_Edit_Policy, THE Workspace SHALL persist the selected Edit_Policy_Value and apply it to subsequent edits.
7. THE Workspace SHALL evaluate the Human_Edit_Policy and the Agent_Edit_Policy independently, so that the value of one policy does not constrain the permitted values of the other.
8. THE Workspace SHALL enforce the configured Human_Edit_Policy and Agent_Edit_Policy on the server for every edit, regardless of whether the Settings_Page controls are currently visible to the acting actor.

### Requirement 2: Enforcing the Edit Policy by Actor Type

**User Story:** As a workspace operator, I want each edit routed according to the acting actor's policy, so that "can't edit", "propose", and "direct edit" behave as configured.

#### Acceptance Criteria

1. WHEN the Workspace routes an edit, THE Workspace SHALL select the Human_Edit_Policy for human actors and the Agent_Edit_Policy for agent actors.
2. WHEN a human actor attempts to change a Document WHILE the Human_Edit_Policy is `cant-edit`, THE Workspace SHALL reject the change and SHALL NOT create a Proposal or apply the change.
3. WHEN an agent actor attempts to change a Document WHILE the Agent_Edit_Policy is `cant-edit`, THE Workspace SHALL reject the change and SHALL NOT create a Proposal or apply the change.
4. WHEN a human actor submits a change WHILE the Human_Edit_Policy is `propose`, THE Workspace SHALL create a Proposal rather than applying the change.
5. WHEN an agent actor submits a change WHILE the Agent_Edit_Policy is `propose`, THE Workspace SHALL create a Proposal rather than applying the change.
6. WHEN a human actor submits a change WHILE the Human_Edit_Policy is `direct`, THE Workspace SHALL apply the change to the Document without creating a Proposal.
7. WHEN an agent actor submits a change WHILE the Agent_Edit_Policy is `direct`, THE Workspace SHALL apply the change to the Document without creating a Proposal.

### Requirement 3: Every Applied Change Is Versioned

**User Story:** As a workspace member, I want every change that lands on a document to be recorded, so that nothing changes without leaving a history entry.

#### Acceptance Criteria

1. WHEN a change is applied to a Document (through an accepted Proposal or a `direct` edit), THE Workspace SHALL append a Document_Version to that Document's Version_History.
2. THE Workspace SHALL record on each Document_Version the resulting content, the Attribution, and a timestamp.
3. THE Workspace SHALL NOT apply a change to a Document without appending a corresponding Document_Version.
4. THE Workspace SHALL keep Document_Versions immutable once recorded.

### Requirement 4: Creating Proposals from Human and Agent Edits

**User Story:** As a workspace member, I want my edits and agent edits to become proposals by default, so that other members can review them before they enter the document.

#### Acceptance Criteria

1. WHEN a human actor submits an edit under the `propose` Human_Edit_Policy, THE Workspace SHALL create a Proposal that records the human actor as the Proposal_Author.
2. WHEN an agent actor submits an edit under the `propose` Agent_Edit_Policy, THE Workspace SHALL create a Proposal that records the agent as the Proposal_Author.
3. THE Workspace SHALL store each Proposal in Supabase with the target Document, the proposed change content, and the Proposal_Author identity.
4. THE Workspace SHALL support Proposals for the existing draft shapes: rich-text, new-section, rename-section, recolor-section, delete-section, and reorder-section.
5. WHILE a Proposal is pending, THE Workspace SHALL NOT alter the target Document's applied content.

### Requirement 5: Workspace-Shared Proposal Visibility

**User Story:** As a workspace member, I want to see all pending proposals from any author, so that review is a shared activity rather than a per-user one.

#### Acceptance Criteria

1. THE Workspace SHALL make every pending Proposal visible to all Workspace_Members regardless of the Proposal_Author.
2. WHEN a Proposal is created, THE Workspace SHALL display the Proposal to Workspace_Members viewing the affected Document.
3. THE Workspace SHALL display, for each Proposal, whether the Proposal_Author was a human actor or an agent actor, and the Attribution.
4. WHERE 2 or more Proposals target one Document, THE Workspace SHALL present a count of pending Proposals and controls to accept all or reject all.

### Requirement 6: Any-Member Accept or Reject

**User Story:** As a workspace member, I want to accept or reject any proposal, so that review is not blocked on a single owner.

#### Acceptance Criteria

1. THE Workspace SHALL allow any Workspace_Member to accept any pending Proposal regardless of the Proposal_Author.
2. THE Workspace SHALL allow any Workspace_Member to reject any pending Proposal regardless of the Proposal_Author.
3. WHEN a Workspace_Member rejects a Proposal, THE Workspace SHALL discard the Proposal and SHALL NOT apply its change.
4. WHEN a Proposal is accepted or rejected, THE Workspace SHALL remove the Proposal from the set of pending Proposals.
5. WHEN a Proposal is rejected, THE Workspace SHALL retain a record of the rejection in the Document history and SHALL NOT return the rejected Proposal to the pending set automatically.
6. IF a Workspace_Member attempts to accept a Proposal that is no longer pending, THEN THE Workspace SHALL reject the accept action and SHALL report that the Proposal is no longer pending.
7. WHILE an accept or reject action on a Proposal is in progress, THE Workspace SHALL prevent a concurrent accept or reject action on the same Proposal, and IF a concurrent action is attempted, THEN THE Workspace SHALL reject the later action and report that the Proposal is already being acted on.

### Requirement 7: Accepting a Proposal Applies It

**User Story:** As a workspace member, I want accepting a proposal to apply the change and record a version, so that acceptance produces real, attributed history.

#### Acceptance Criteria

1. WHEN a Workspace_Member accepts a pending Proposal, THE Workspace SHALL apply the proposed change to the target Document in Supabase.
2. WHEN a Workspace_Member accepts a pending Proposal, THE Workspace SHALL append a Document_Version whose Attribution credits the Proposal_Author.
3. WHEN a change is applied through acceptance, THE Workspace SHALL make the updated Document content visible to all Workspace_Members.
4. IF the target Document changed since the Proposal was created such that the Proposal can no longer apply cleanly, THEN THE Workspace SHALL reject the accept action and SHALL report that the Proposal is out of date.

### Requirement 8: Version History, Compare, and Revert

**User Story:** As a workspace member, I want to browse a document's history and revert to an earlier version, so that I have real version control without leaving Creed.

#### Acceptance Criteria

1. THE Workspace SHALL present a Document's Version_History as an ordered list of Document_Versions with Attribution and timestamps.
2. WHEN a Workspace_Member selects a Document_Version, THE Workspace SHALL display the differences between that Document_Version and the current Document content.
3. WHEN a Workspace_Member reverts a Document to a selected Document_Version, THE Workspace SHALL apply the selected version's content as a new change subject to the acting actor's Edit_Policy.
4. WHEN a revert is applied, THE Workspace SHALL append a new Document_Version recording the revert rather than deleting later Document_Versions.

### Requirement 9: Responsive Editing

**User Story:** As a document author, I want editing to feel immediate, so that review does not make the editor sluggish.

#### Acceptance Criteria

1. WHEN a human author makes a change in the editor, THE Workspace SHALL display that change locally in the author's editor without waiting for other members' review.
2. WHILE a human author's change is being submitted as a Proposal or a `direct` edit, THE Workspace SHALL indicate the submission state to the author.
3. IF submitting a change fails, THEN THE Workspace SHALL indicate to the author that the change was not saved.

### Requirement 10: Concurrency Safety

**User Story:** As a workspace member, I want concurrent edits handled safely, so that two people's changes do not silently overwrite each other.

#### Acceptance Criteria

1. WHEN the Workspace applies a change to a Document, THE Workspace SHALL guard the write with the Document's current Revision.
2. IF a change is submitted against a stale Revision, THEN THE Workspace SHALL reject the write and SHALL report that the Document changed since it was read.
3. WHEN a Document write succeeds, THE Workspace SHALL advance the Document's Revision.

### Requirement 11: Removal of GitHub Repository Syncing

**User Story:** As a workspace member, I want the document workspace to stop depending on GitHub, so that the product is simpler and no repository access is required.

#### Acceptance Criteria

1. THE Document_Toolbar SHALL NOT present Save, Publish document, or Pull document controls tied to GitHub repository syncing.
2. THE Workspace SHALL manage all document content, Proposals, and Version_History in Supabase without pushing to or pulling from a GitHub repository.
3. THE Workspace SHALL NOT require GitHub repository access for any Workspace_Member to view, edit, propose, accept, reject, or revert Documents.
4. THE Workspace SHALL remove the document-workspace GitHub sync controls and status from the document viewer.

### Requirement 12: Removal of the Legacy Per-Section Permission UI

**User Story:** As a workspace operator, I want the old per-section permission grid removed and replaced by the two-policy model, so that settings reflect the current architecture.

#### Acceptance Criteria

1. THE Settings_Page SHALL NOT display the Legacy_Section_Permission_UI.
2. THE Settings_Page SHALL present the Human_Edit_Policy and Agent_Edit_Policy controls in place of the prior single "Agent edit behaviour" control.
3. THE Workspace SHALL scope the Human_Edit_Policy and Agent_Edit_Policy to the multi-document Workspace and SHALL NOT apply them to the legacy single-file profile, even when a Workspace contains both multi-document areas and legacy single-file sections.

### Requirement 13: Attribution Rules

**User Story:** As a workspace member, I want changes attributed correctly, so that I can tell who a change came from.

#### Acceptance Criteria

1. WHEN an agent authors a change, THE Workspace SHALL attribute the Proposal and any resulting Document_Version to that named agent.
2. WHEN a Workspace_Member authors a change directly, THE Workspace SHALL attribute the Proposal and any resulting Document_Version to that member.
3. THE Workspace SHALL display the Attribution on pending Proposals and on Document_Versions in the Version_History.

### Requirement 14: Agent-Facing Documentation and MCP Instructions

**User Story:** As a connected agent, I want the agent guidance and MCP tool instructions to describe the Supabase-only proposal model, so that I edit shared documents correctly under the workspace policy.

#### Acceptance Criteria

1. THE agent guidance file (`AGENTS.md`) SHALL describe that shared documents are Supabase-only, that GitHub syncing for documents has been removed, and that agent edits are governed by the workspace Agent_Edit_Policy.
2. THE MCP connect-time instructions SHALL state that agent document edits may become Proposals requiring approval, depending on the Agent_Edit_Policy.
3. THE MCP document tool descriptions (`creed_update_document`, `creed_update_document_metadata`, `creed_create_document`) SHALL state that a change is applied directly or recorded as a pending Proposal according to the Agent_Edit_Policy, and SHALL report which outcome occurred.
4. THE agent-facing documentation SHALL NOT instruct agents to push, pull, or publish shared documents to GitHub.
