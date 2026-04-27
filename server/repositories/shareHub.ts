import { db, eq, desc, and, sql, isNull } from "./base";
import {
  shareConversations,
  shareParticipants,
  shareMessages,
  shareAttachments,
  type ShareConversation,
  type ShareParticipant,
  type ShareMessage,
  type ShareAttachment,
} from "@shared/schema";

class ShareHubRepository {
  async createConversation(data: {
    companyId: number;
    subject: string;
    createdByType: string;
    createdById: number;
    participantIds: { type: string; id: number }[];
  }): Promise<ShareConversation> {
    const [conv] = await db
      .insert(shareConversations)
      .values({
        companyId: data.companyId,
        subject: data.subject,
        createdByType: data.createdByType,
        createdById: data.createdById,
      })
      .returning();

    const participantValues = data.participantIds.map((p) => ({
      conversationId: conv.id,
      participantType: p.type,
      participantId: p.id,
    }));

    if (!participantValues.find((p) => p.participantType === data.createdByType && p.participantId === data.createdById)) {
      participantValues.push({
        conversationId: conv.id,
        participantType: data.createdByType,
        participantId: data.createdById,
      });
    }

    await db.insert(shareParticipants).values(participantValues);

    return conv;
  }

  async getConversationsByParticipant(
    companyId: number,
    participantType: string,
    participantId: number,
  ): Promise<(ShareConversation & { participants: ShareParticipant[]; lastMessage: ShareMessage | null; unreadCount: number })[]> {
    const participantRows = await db
      .select()
      .from(shareParticipants)
      .innerJoin(shareConversations, eq(shareParticipants.conversationId, shareConversations.id))
      .where(
        and(
          eq(shareParticipants.participantType, participantType),
          eq(shareParticipants.participantId, participantId),
          eq(shareConversations.companyId, companyId),
          isNull(shareParticipants.deletedAt),
        ),
      )
      .orderBy(desc(shareConversations.updatedAt));

    const results = [];
    for (const row of participantRows) {
      const conv = row.share_conversations;
      const myParticipant = row.share_participants;

      const participants = await db
        .select()
        .from(shareParticipants)
        .where(eq(shareParticipants.conversationId, conv.id));

      const [lastMessage] = await db
        .select()
        .from(shareMessages)
        .where(eq(shareMessages.conversationId, conv.id))
        .orderBy(desc(shareMessages.createdAt))
        .limit(1);

      let unreadCount = 0;
      if (myParticipant.lastReadAt) {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(shareMessages)
          .where(
            and(
              eq(shareMessages.conversationId, conv.id),
              sql`${shareMessages.createdAt} > ${myParticipant.lastReadAt}`,
            ),
          );
        unreadCount = countResult?.count ?? 0;
      } else {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(shareMessages)
          .where(eq(shareMessages.conversationId, conv.id));
        unreadCount = countResult?.count ?? 0;
      }

      results.push({ ...conv, participants, lastMessage: lastMessage ?? null, unreadCount });
    }

    return results;
  }

  async getConversationById(conversationId: number): Promise<ShareConversation | null> {
    const [conv] = await db
      .select()
      .from(shareConversations)
      .where(eq(shareConversations.id, conversationId));
    return conv ?? null;
  }

  async getParticipants(conversationId: number): Promise<ShareParticipant[]> {
    return db
      .select()
      .from(shareParticipants)
      .where(eq(shareParticipants.conversationId, conversationId));
  }

  async isParticipant(conversationId: number, participantType: string, participantId: number): Promise<boolean> {
    const [row] = await db
      .select({ id: shareParticipants.id })
      .from(shareParticipants)
      .where(
        and(
          eq(shareParticipants.conversationId, conversationId),
          eq(shareParticipants.participantType, participantType),
          eq(shareParticipants.participantId, participantId),
        ),
      )
      .limit(1);
    return !!row;
  }

  async addMessage(data: {
    conversationId: number;
    senderType: string;
    senderId: number;
    body?: string | null;
    sharedOfferId?: number | null;
    sharedEnquiryId?: number | null;
  }): Promise<ShareMessage> {
    const [msg] = await db
      .insert(shareMessages)
      .values({
        conversationId: data.conversationId,
        senderType: data.senderType,
        senderId: data.senderId,
        body: data.body ?? null,
        sharedOfferId: data.sharedOfferId ?? null,
        sharedEnquiryId: data.sharedEnquiryId ?? null,
      })
      .returning();

    await db
      .update(shareConversations)
      .set({ updatedAt: new Date() })
      .where(eq(shareConversations.id, data.conversationId));

    return msg;
  }

  async getMessages(conversationId: number): Promise<(ShareMessage & { attachments: ShareAttachment[] })[]> {
    const msgs = await db
      .select()
      .from(shareMessages)
      .where(eq(shareMessages.conversationId, conversationId))
      .orderBy(shareMessages.createdAt);

    const results = [];
    for (const msg of msgs) {
      const attachments = await db
        .select()
        .from(shareAttachments)
        .where(eq(shareAttachments.messageId, msg.id));
      results.push({ ...msg, attachments });
    }

    return results;
  }

  async addAttachment(data: {
    messageId: number;
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
  }): Promise<ShareAttachment> {
    const [att] = await db
      .insert(shareAttachments)
      .values(data)
      .returning();
    return att;
  }

  async getAttachmentConversationId(filename: string): Promise<number | null> {
    const [att] = await db
      .select({ messageId: shareAttachments.messageId })
      .from(shareAttachments)
      .where(eq(shareAttachments.filename, filename))
      .limit(1);
    if (!att) return null;
    const [msg] = await db
      .select({ conversationId: shareMessages.conversationId })
      .from(shareMessages)
      .where(eq(shareMessages.id, att.messageId))
      .limit(1);
    return msg?.conversationId ?? null;
  }

  async markRead(conversationId: number, participantType: string, participantId: number): Promise<void> {
    await db
      .update(shareParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(shareParticipants.conversationId, conversationId),
          eq(shareParticipants.participantType, participantType),
          eq(shareParticipants.participantId, participantId),
        ),
      );
  }

  async getTotalUnreadCount(companyId: number, participantType: string, participantId: number): Promise<number> {
    const convos = await this.getConversationsByParticipant(companyId, participantType, participantId);
    return convos.reduce((sum, c) => sum + c.unreadCount, 0);
  }

  async softDeleteConversation(conversationId: number, participantType: string, participantId: number): Promise<void> {
    await db
      .update(shareParticipants)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(shareParticipants.conversationId, conversationId),
          eq(shareParticipants.participantType, participantType),
          eq(shareParticipants.participantId, participantId),
        ),
      );
  }
}

export const shareHubRepository = new ShareHubRepository();
