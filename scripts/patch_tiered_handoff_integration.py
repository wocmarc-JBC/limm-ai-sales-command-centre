from pathlib import Path

AUTO_REPLY = Path("lib/whatsapp-auto-reply.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Missing tiered handoff patch point: {label}")
    return text.replace(old, new, 1)


text = AUTO_REPLY.read_text()
old_import = 'import { processWhatsAppHandoffEmail } from "@/lib/handoff-email";'
new_import = old_import + '\nimport { finalizeWhatsAppHandoffPause } from "@/lib/data/whatsapp-handoff-control-repository";'
text = replace_once(text, old_import, new_import, "control import")

success_old = '''    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      acknowledgementIntent: decision.acknowledgementIntent,
      replySent: true,
      replySignature: decision.replySignature || String(decision.blackBoxTrace.finalReplyHash ?? "")
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_sent",
      reason: "WhatsApp auto-reply sent after safety validation.",'''
success_new = '''    await recordConversationSafetyOutcomeSafely({
      lead,
      providerMessageId,
      conversationIntent: decision.conversationIntent,
      acknowledgementIntent: decision.acknowledgementIntent,
      replySent: true,
      replySignature: decision.replySignature || String(decision.blackBoxTrace.finalReplyHash ?? "")
    });
    const sentHandoffControl = await finalizeWhatsAppHandoffPause({
      leadId: lead.id,
      tier: handoffEmail.tier,
      reasons: handoffEmail.reasons,
      pauseAfterReply: handoffEmail.pauseAfterReply,
      outcome: "reply_sent"
    }).catch((handoffControlError) => {
      logWhatsAppError("tiered_handoff_pause_finalize", {
        providerMessageId,
        leadId: lead.id,
        outcome: "reply_sent",
        reason: safeError(handoffControlError)
      });
      return { pauseApplied: false, outcome: "reply_sent" as const };
    });
    Object.assign(decision.blackBoxTrace, {
      handoffPauseFinalized: sentHandoffControl.pauseApplied,
      handoffFinalOutcome: sentHandoffControl.outcome
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_sent",
      reason: "WhatsApp auto-reply sent after safety validation.",'''
text = replace_once(text, success_old, success_new, "successful send")

persistence_old = '''      await recordConversationSafetyOutcomeSafely({
        lead,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        acknowledgementIntent: decision.acknowledgementIntent,
        replySent: true,
        replySignature: decision.replySignature || String(decision.blackBoxTrace.finalReplyHash ?? "")
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_sent",
        reason: "WhatsApp auto-reply was sent, but post-send persistence needs operator review.",'''
persistence_new = '''      await recordConversationSafetyOutcomeSafely({
        lead,
        providerMessageId,
        conversationIntent: decision.conversationIntent,
        acknowledgementIntent: decision.acknowledgementIntent,
        replySent: true,
        replySignature: decision.replySignature || String(decision.blackBoxTrace.finalReplyHash ?? "")
      });
      const persistenceHandoffControl = await finalizeWhatsAppHandoffPause({
        leadId: lead.id,
        tier: handoffEmail.tier,
        reasons: handoffEmail.reasons,
        pauseAfterReply: handoffEmail.pauseAfterReply,
        outcome: "post_send_persistence_failed"
      }).catch((handoffControlError) => {
        logWhatsAppError("tiered_handoff_pause_finalize", {
          providerMessageId,
          leadId: lead.id,
          outcome: "post_send_persistence_failed",
          reason: safeError(handoffControlError)
        });
        return { pauseApplied: false, outcome: "post_send_persistence_failed" as const };
      });
      Object.assign(decision.blackBoxTrace, {
        handoffPauseFinalized: persistenceHandoffControl.pauseApplied,
        handoffFinalOutcome: persistenceHandoffControl.outcome
      });
      return {
        providerMessageId,
        leadId: lead.id,
        status: "auto_reply_sent",
        reason: "WhatsApp auto-reply was sent, but post-send persistence needs operator review.",'''
text = replace_once(text, persistence_old, persistence_new, "post-send persistence")

failure_old = '''    await auditWhatsApp({
      action: "whatsapp_auto_reply_send_failed",
      leadId: lead.id,
      summary: "WhatsApp auto-reply send failed and was logged without starting a retry loop.",
      metadata: {
        providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
        status: sendError.status,
        metaCode: sendError.metaCode,
        metaMessage: sendError.metaMessage,
        metaType: sendError.metaType,
        ...decision.blackBoxTrace,
        final_send_result: "failed"
      }
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_failed",'''
failure_new = '''    await auditWhatsApp({
      action: "whatsapp_auto_reply_send_failed",
      leadId: lead.id,
      summary: "WhatsApp auto-reply send failed and was logged without starting a retry loop.",
      metadata: {
        providerMessageId,
        error: error instanceof Error ? error.message : "Unknown WhatsApp send failure",
        status: sendError.status,
        metaCode: sendError.metaCode,
        metaMessage: sendError.metaMessage,
        metaType: sendError.metaType,
        ...decision.blackBoxTrace,
        final_send_result: "failed"
      }
    });
    const failedHandoffControl = await finalizeWhatsAppHandoffPause({
      leadId: lead.id,
      tier: handoffEmail.tier,
      reasons: handoffEmail.reasons,
      pauseAfterReply: handoffEmail.pauseAfterReply,
      outcome: "reply_send_failed"
    }).catch((handoffControlError) => {
      logWhatsAppError("tiered_handoff_pause_finalize", {
        providerMessageId,
        leadId: lead.id,
        outcome: "reply_send_failed",
        reason: safeError(handoffControlError)
      });
      return { pauseApplied: false, outcome: "reply_send_failed" as const };
    });
    Object.assign(decision.blackBoxTrace, {
      handoffPauseFinalized: failedHandoffControl.pauseApplied,
      handoffFinalOutcome: failedHandoffControl.outcome
    });
    return {
      providerMessageId,
      leadId: lead.id,
      status: "auto_reply_failed",'''
text = replace_once(text, failure_old, failure_new, "send failure")
AUTO_REPLY.write_text(text)
