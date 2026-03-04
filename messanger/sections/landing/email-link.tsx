'use client';

import * as React from 'react';

import { useToast } from '@/components/ui/toast-provider';
import { copyText } from '@/lib/clipboard';
import { buildMailtoUrl, CONTACT_EMAIL } from '@/lib/contact';
import { createTranslator, type Locale } from '@/lib/i18n';

type EmailLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  email?: string;
  subject?: string;
  body?: string;
  locale?: Locale;
  copyOnClick?: boolean;
  openMailto?: boolean;
};

const toastCopy: Partial<
  Record<
    Locale,
    {
      successTitle: string;
      successDescription: string;
      failTitle: string;
      failDescription: string;
    }
  >
> & {
  en: {
    successTitle: string;
    successDescription: string;
    failTitle: string;
    failDescription: string;
  };
} = {
  ru: {
    successTitle: 'Email скопирован',
    successDescription: 'Вставьте адрес в письмо в вашем почтовом клиенте или веб‑почте.',
    failTitle: 'Не удалось скопировать email',
    failDescription: 'Скопируйте адрес вручную из текста на кнопке/странице.',
  },
  en: {
    successTitle: 'Email copied',
    successDescription: 'Paste the address into your mail app or webmail.',
    failTitle: 'Could not copy email',
    failDescription: 'Please copy the address manually from the button/page.',
  },
  es: {
    successTitle: 'Email copiado',
    successDescription: 'Pega la dirección en tu app de correo o webmail.',
    failTitle: 'No se pudo copiar el email',
    failDescription: 'Copia la dirección manualmente desde el botón/página.',
  },
  'zh-CN': {
    successTitle: '邮箱已复制',
    successDescription: '请将地址粘贴到邮件客户端或网页邮箱中。',
    failTitle: '邮箱复制失败',
    failDescription: '请从页面手动复制邮箱地址。',
  },
  ja: {
    successTitle: 'メールアドレスをコピーしました',
    successDescription: 'メールアプリまたは Web メールに貼り付けてください。',
    failTitle: 'メールアドレスをコピーできませんでした',
    failDescription: 'ページ上のアドレスを手動でコピーしてください。',
  },
};

export const EmailLink = React.forwardRef<HTMLAnchorElement, EmailLinkProps>(
  (
    {
      email = CONTACT_EMAIL,
      subject,
      body,
      locale = 'en',
      copyOnClick = true,
      openMailto,
      onClick,
      ...props
    },
    ref,
  ) => {
    const toast = useToast();
    const href = buildMailtoUrl({ to: email, subject, body });
    const t = createTranslator(locale, toastCopy);

    return (
      <a
        {...props}
        href={href}
        ref={ref}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) {
            return;
          }

          const shouldOpenMailto =
            openMailto ??
            Boolean(
              window.matchMedia?.('(pointer: coarse)')?.matches ||
                window.matchMedia?.('(hover: none)')?.matches,
            );

          if (!shouldOpenMailto) {
            event.preventDefault();
          }

          if (copyOnClick) {
            void copyText(email).then((ok) => {
              toast.push({
                intent: ok ? 'success' : 'warn',
                title: ok ? t('successTitle') : t('failTitle'),
                description: ok ? t('successDescription') : t('failDescription'),
              });
            });
          }
        }}
      />
    );
  },
);
EmailLink.displayName = 'EmailLink';
