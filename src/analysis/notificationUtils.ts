export function normalizeText(value: any): string {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function resolveRunUserId(resources: any, recipient?: string): Promise<string | null> {
    if (!recipient) return null;

    const raw = String(recipient).trim();
    if (!raw) return null;

    try {
        const user = await resources.run.userInfo(raw);
        if (user?.id) return user.id;
        return raw;
    } catch (_) {
        // Pode ser e-mail/nome em vez de ID do usuario Run.
    }

    if (!looksLikeEmail(raw) && raw.length >= 20) {
        return raw;
    }

    let page = 1;
    const wanted = normalizeText(raw);

    while (true) {
        const users = await resources.run.listUsers({
            page,
            amount: 100,
            fields: ["id", "name", "email", "tags", "active"]
        });

        const found = (users || []).find((user: any) => {
            const values = [user.id, user.email, user.name]
                .filter(Boolean)
                .map((item) => normalizeText(item));
            return values.includes(wanted);
        });

        if (found?.id) return found.id;
        if (!users || users.length < 100) break;
        page += 1;
    }

    return null;
}

export async function sendRunNotification(resources: any, recipient: string | undefined, title: string, message: string, context?: any): Promise<boolean> {
    const userId = await resolveRunUserId(resources, recipient);

    if (!userId) {
        context?.log?.("No Run user found for notification recipient: " + (recipient || "empty"));
        return false;
    }

    try {
        await resources.run.notificationCreate(userId, { title, message });
        context?.log?.("Push notification sent to user " + userId);
        return true;
    } catch (error) {
        context?.log?.("Error sending push notification to " + userId + ": " + error);
        return false;
    }
}
