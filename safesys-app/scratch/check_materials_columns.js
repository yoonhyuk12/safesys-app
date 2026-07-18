// 자재 테이블의 컬럼 구성을 점검하는 일회성 스크립트
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  // materials 테이블의 1개 로우를 조회하여 존재하는 컬럼을 파악합니다.
  const { data, error } = await supabase.from('materials').select('*').limit(1);
  if (error) {
    console.error('Error fetching materials:', error);
  } else {
    console.log('Materials data:', data);
  }
}

check();
