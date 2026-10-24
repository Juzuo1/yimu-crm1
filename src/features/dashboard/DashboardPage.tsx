import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Statistic, List, Button, Tag, Empty, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Customer, DashboardSummary } from '@/lib/database.types';
import { GRADE_COLORS, SOURCE_LABELS, STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';
import dayjs from 'dayjs';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary');
      if (error) throw error;
      return data as DashboardSummary;
    },
  });

  const { data: dueToday = [] } = useQuery({
    queryKey: ['dashboard-due-today'],
    queryFn: async () => {
      const start = dayjs().startOf('day').toISOString();
      const end = dayjs().endOf('day').toISOString();
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('owner_id', profile!.id)
        .gte('next_follow_up_at', start)
        .lte('next_follow_up_at', end)
        .order('next_follow_up_at')
        .limit(5);
      return (data as Customer[]) ?? [];
    },
  });

  const trendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: (summary?.new_trend ?? []).map((t) => t.month) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      name: '新增客户', type: 'line', smooth: true, data: (summary?.new_trend ?? []).map((t) => t.count),
      itemStyle: { color: '#FF6B35' }, areaStyle: { opacity: 0.12 },
    }],
  };

  const pieOption = (data: { name: string; value: number }[], nameMap?: Record<string, string>, colorMap?: Record<string, string>) => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} 个 ({d}%)' },
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [{
      name: '分布', type: 'pie', radius: ['40%', '70%'], avoidLabelOverlap: true,
      label: { fontSize: 12 },
      data: data.map((d) => ({
        name: nameMap?.[d.name] ?? d.name,
        value: d.value,
        itemStyle: colorMap?.[d.name] ? { color: colorMap[d.name] } : undefined,
      })),
    }],
  });

  const rankOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 80, right: 30, top: 20, bottom: 20 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: (summary?.followup_ranking ?? []).map((r) => r.name).reverse() },
    series: [{
      name: '近30天跟进次数', type: 'bar', barWidth: 16,
      data: (summary?.followup_ranking ?? []).map((r) => r.count).reverse(),
      itemStyle: { color: '#0A2540' },
    }],
  };

  if (isLoading || !summary) {
    return (
      <PageContainer title="工作台">
        <Skeleton active paragraph={{ rows: 10 }} />
      </PageContainer>
    );
  }

  return (
    <PageContainer title={`工作台 · ${profile?.name ?? ''}`}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="客户总数" value={summary.total_customers} valueStyle={{ color: '#0A2540' }} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="我的客户" value={summary.my_customers} valueStyle={{ color: '#0A2540' }} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="公海客户" value={summary.pool_customers} valueStyle={{ color: '#FF6B35' }} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="今日待跟进" value={summary.due_today} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="已逾期" value={summary.overdue} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small"><Statistic title="近30天跟进" value={(summary.followup_ranking ?? []).reduce((s, r) => s + r.count, 0)} valueStyle={{ color: '#0A2540' }} /></Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title="客户增长趋势（近12个月）">
            <ReactECharts option={trendOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="今日待跟进">
            {dueToday.length ? (
              <List
                dataSource={dueToday}
                renderItem={(c) => (
                  <List.Item
                    actions={[
                      <Button type="link" size="small" key="d" onClick={() => navigate(`/customers/${c.id}`)}>详情</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <>
                          <span className="grade-dot" style={{ background: GRADE_COLORS[c.grade] }} />
                          {c.company_name}
                        </>
                      }
                      description={`计划跟进时间：${c.next_follow_up_at ? dayjs(c.next_follow_up_at).format('HH:mm') : '-'} · ${c.country ?? ''}`}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="今日没有待跟进客户" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="客户等级分布">
            <ReactECharts option={pieOption(summary.grade_dist, undefined, GRADE_COLORS)} style={{ height: 240 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="客户来源分布">
            <ReactECharts option={pieOption(summary.source_dist, SOURCE_LABELS)} style={{ height: 240 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="客户状态分布">
            <ReactECharts option={pieOption(summary.status_dist, STATUS_LABELS, STATUS_COLORS)} style={{ height: 240 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="业务员跟进排行（近30天）">
            {(summary.followup_ranking ?? []).length ? (
              <ReactECharts option={rankOption} style={{ height: 240 }} />
            ) : (
              <Empty description="暂无跟进数据" />
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}
