const DEFAULT_PROFILE_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="minicrew-avatar-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F9C4D2" />
      <stop offset="100%" stop-color="#C16A80" />
    </linearGradient>
  </defs>
  <circle cx="60" cy="60" r="58" fill="url(#minicrew-avatar-bg)" />
  <circle cx="60" cy="47" r="20" fill="#FFF8FA" />
  <path
    d="M23 100c6-16 23-26 37-26 14 0 31 10 37 26H23z"
    fill="#FFF8FA"
  />
</svg>`;

export const DEFAULT_PROFILE_AVATAR_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_PROFILE_AVATAR_SVG)}`;

export function getDefaultProfileAvatar(): string {
    return DEFAULT_PROFILE_AVATAR_DATA_URL;
}

export function getProfileAvatarUrl(value?: string | null): string {
    const trimmed = value?.trim();
    return trimmed ? trimmed : getDefaultProfileAvatar();
}
