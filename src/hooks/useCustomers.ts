import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Customer } from '@/lib/database.types';

// 当前用户可见的客户（含公海、共享），用于下拉选择
export function useVisibleCustomers() {
  return useQuery({
    queryKey: ['visible-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, in_pool')
        .order('company_name');
      if (error) throw error;
      return data as Pick<Customer, 'id' | 'company_name' | 'in_pool'>[];
    },
  });
}
