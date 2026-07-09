const siteUrl = 'https://www.careerservice.co.kr';

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': `${siteUrl}/#organization`,
  name: '케이잡스 K·JOBS 재취업지원서비스 시행지원',
  alternateName: ['K·JOBS', '케이잡스', 'KJOBS', 'K-JOBS', '케이잡스 주식회사', '재취업지원서비스 시행지원'],
  url: siteUrl,
  telephone: ['02-797-5659', '010-5747-8286'],
  email: 'h.douze@kjobs.co.kr',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '한강대로80길 11-49, 1층 2호',
    addressLocality: '용산구',
    addressRegion: '서울특별시',
    addressCountry: 'KR',
  },
  areaServed: {
    '@type': 'Country',
    name: '대한민국',
  },
  serviceType: ['재취업지원서비스 기업컨설팅', '커리어플래닝서비스', '중장년 경력설계 상담'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    telephone: '02-797-5659',
    email: 'h.douze@kjobs.co.kr',
    availableLanguage: ['ko'],
  },
};

export const servicesJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${siteUrl}/business-consulting/#service`,
    name: '재취업지원서비스 기업컨설팅',
    serviceType: '기업컨설팅',
    provider: { '@id': `${siteUrl}/#organization` },
    areaServed: '대한민국',
    url: `${siteUrl}/business-consulting/`,
    description: '기업이 재취업지원서비스를 자체 제도화하고 시행할 수 있도록 현황 진단, 운영체계 설계, 파일럿 운영, 개선과제 정리를 지원합니다.',
    audience: {
      '@type': 'BusinessAudience',
      name: '재취업지원서비스 도입 또는 개선을 검토하는 기업',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${siteUrl}/career-planning/#service`,
    name: '커리어플래닝서비스',
    serviceType: '중장년 경력설계 상담',
    provider: { '@id': `${siteUrl}/#organization` },
    areaServed: '대한민국',
    url: `${siteUrl}/career-planning/`,
    description: '중장년 재직자의 직무경험과 보유역량을 점검하고 향후 경력방향, 직무전환, 계속근로, 재취업 준비를 상담 중심으로 정리합니다.',
    audience: {
      '@type': 'PeopleAudience',
      suggestedMinAge: 40,
      name: '중장년 재직자',
    },
  },
];

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  name: 'K·JOBS 재취업지원서비스 시행지원',
  url: siteUrl,
  inLanguage: 'ko-KR',
  publisher: { '@id': `${siteUrl}/#organization` },
  about: [
    '재취업지원서비스',
    '재취업지원서비스 시행지원',
    '재취업지원서비스 기업컨설팅',
    '재취업지원서비스 도입',
    '재취업지원서비스 운영체계',
    '재취업지원서비스 의무기업',
    '퇴직예정자 지원',
    '전직지원',
    '기업 인사담당자',
    '커리어플래닝서비스',
    '중장년 경력설계',
    '중장년 경력진단',
    '재직자 경력설계 상담',
    '직무경험 정리',
    '직무전환',
    '계속근로',
    '재취업 준비',
  ],
};

export const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${siteUrl}/#faq`,
  mainEntity: [
    {
      '@type': 'Question',
      name: '재취업지원서비스 기업컨설팅은 무엇을 지원하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '기업이 재취업지원서비스를 자체적으로 제도화하고 운영할 수 있도록 현황 진단, 운영체계 설계, 파일럿 운영, 개선과제 정리를 지원합니다.',
      },
    },
    {
      '@type': 'Question',
      name: '커리어플래닝서비스는 누구를 위한 서비스인가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '중장년 재직자의 직무경험과 보유역량을 점검하고 향후 경력방향과 실행계획을 정리하는 경력설계 상담 서비스입니다.',
      },
    },
    {
      '@type': 'Question',
      name: '상담은 어떻게 신청하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '문의 페이지에서 상담 유형을 선택하고 기본 정보를 남기면 담당자가 확인 후 연락합니다. 민감정보와 주민등록번호는 입력하지 않아야 합니다.',
      },
    },
  ],
};

export const homeJsonLd = [organizationJsonLd, websiteJsonLd, ...servicesJsonLd, faqJsonLd];
export const businessConsultingJsonLd = [organizationJsonLd, servicesJsonLd[0]];
export const careerPlanningJsonLd = [organizationJsonLd, servicesJsonLd[1]];
export const contactJsonLd = [organizationJsonLd];
