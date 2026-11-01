# Relationship origins

Migration `20261029000100_relationship_modes.sql` records the Friends/Dating
origin of new discovery requests and returns it in authorized request lists and
conversation inboxes. The browser never assigns a mode based on someone's name,
appearance, settings or profile. No generic Connection label substitutes for it.

The private metadata table is inaccessible to anonymous/authenticated database
roles. Mode-specific request RPCs record the origin in the same transaction as
the relationship. Repeating a request or accepting it preserves that origin.
Responding through the opposite mode is rejected by the mode-specific RPCs;
the existing single-pair/single-chat model is unchanged. A Dating **Like back**
uses the Dating request RPC to establish a reciprocal match, not Friends acceptance.

Removing a relationship preserves its last mode for the existing chat history.
A genuinely new relationship can record its own mode. No additional relationship,
chat or romantic consent is inferred from a Friends connection.

Historical records have no trustworthy origin data. The migration does not guess
or globally backfill them. Their inbox badge is omitted and pending requests use
an Earlier requests section. The five local demo pairs created through the known
Friends seed/request commands were separately annotated after ownership checks.

Only the local canonical stack has been migrated during development. Applying
this migration elsewhere is a separate deployment step; normal historical users
must not receive guessed modes. Legacy generic request RPCs remain unclassified
unless their origin is established separately.

Tests cover Friends/Dating request metadata, reciprocal Dating likes, acceptance,
idempotent retries, preservation through removal, private helper permissions,
independent Requests collapse controls and correct inbox badge rendering.
