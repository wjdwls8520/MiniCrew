import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

function getSupabaseEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!url || !anonKey) {
        throw new Error('서버 Supabase 환경 변수가 설정되지 않았습니다.');
    }

    return { url, anonKey, serviceRoleKey: serviceRoleKey || '' };
}

/**
 * Service role 키를 사용하는 Supabase 클라이언트 (RLS 무시).
 * BFF에서 사용자 인증 확인 후 DB 작업에 사용합니다.
 *
 * sb_secret_ 키 형식에서는 Authorization 헤더에도
 * 해당 키를 설정해야 RLS가 정상적으로 우회됩니다.
 */
export function createServiceRoleClient(): SupabaseClient {
    const { url, serviceRoleKey } = getSupabaseEnv();
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
    }

    return createClient(url, serviceRoleKey, {
        global: {
            headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
            },
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}

export function getBearerToken(request: Request): string | null {
    const authorization = request.headers.get('authorization')?.trim();
    if (!authorization) {
        return null;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return null;
    }

    const token = match[1]?.trim();
    return token || null;
}

/**
 * BFF 라우트에서 사용할 Supabase 클라이언트를 생성합니다.
 *
 * accessToken이 있으면 커스텀 fetch를 통해 모든 PostgREST 요청에
 * Authorization: Bearer <JWT> 헤더를 강제 주입합니다.
 */
function createRouteSupabaseClient(accessToken?: string | null): SupabaseClient {
    const { url, anonKey } = getSupabaseEnv();

    if (accessToken) {
        return createClient(url, anonKey, {
            global: {
                headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
        });
    }

    return createClient(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}

export async function getAuthUserFromRequest(request: Request): Promise<{
    supabase: SupabaseClient;
    accessToken: string | null;
    user: User | null;
}> {
    const accessToken = getBearerToken(request);
    const supabase = createRouteSupabaseClient(accessToken);

    if (!accessToken) {
        return { supabase, accessToken: null, user: null };
    }

    // getUser 검증은 accessToken이 없는 별도 클라이언트에서 수행
    // (accessToken이 주입된 클라이언트에서 auth.getUser() 호출 시
    //  내부 충돌이 발생할 수 있음)
    const lookupClient = createRouteSupabaseClient(null);
    const { data, error } = await lookupClient.auth.getUser(accessToken);
    if (error || !data.user) {
        return { supabase, accessToken, user: null };
    }

    return { supabase, accessToken, user: data.user };
}

