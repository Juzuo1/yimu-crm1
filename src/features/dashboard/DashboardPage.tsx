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

  const kpis: { label: string; value: number; color?: string }[] = [
    { label: '客户总数', value: summary.total_customers },
    { label: '我的客户', value: summary.my_customers },
    { label: '公海客户', value: summary.pool_customers, color: '#FF6B35' },
    { label: '今日待跟进', value: summary.due_today, color: '#a8580f' },
    { label: '已逾期', value: summary.overdue, color: '#b32424' },
    { label: '近30天跟进', value: (summary.followup_ranking ?? []).reduce((s, r) => s + r.count, 0) },
  ];

  return (
    <PageContainer
      title="工作台"
      subtitle={`${dayjs().format('YYYY 年 M 月 D 日')} · 你好，${profile?.name ?? ''}`}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {kpis.map((k) => (
          <Col xs={12} sm={8} lg={4} key={k.label}>
            <div className="stat-card">
              <div className="stat-label">{k.label}</div>
              <div className="stat-value" style={k.color ? { color: k.color } : undefined}>{k.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={12}>
          <div className="ui-card">
            <div className="section-title" style={{ marginBottom: 12 }}>客户增长趋势（近 12 个月）</div>
            <ReactECharts option={trendOption} style={{ height: 260 }} />
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div className="ui-card">
            <div className="section-title" style={{ marginBottom: 8 }}>今日待跟进</div>
            {dueToday.length ? (
              <List
                dataSource={dueToday}
                renderItem={(c) => (
                  <List.Item
                    style={{ padding: '10px 0', borderBottom: '1px solid #f0f3f7' }}
                    actions={[
                      <Button type="link" size="small" key="d" onClick={() => navigate(`/customers/${c.id}`)}>去跟进</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<div className="avatar-brand-sm">{c.company_name.slice(0, 2).toUpperCase()}</div>}
                      title={<span style={{ fontSize: 13, fontWeight: 500, color: '#0A2540' }}>{c.company_name}</span>}
                      description={
                        <span style={{ fontSize: 12, color: '#9aa7b8' }}>
                          {c.next_follow_up_at ? dayjs(c.next_follow_up_at).format('HH:mm') : '-'} · {c.country ?? ''}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="今日没有待跟进客户" />
            )}
          </div>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={6}>
          <div className="ui-card">
            <div className="section-title" style={{ marginBottom: 8 }}>客户等级分布</div>
            <ReactECharts option={pieOption(summary.grade_dist, undefined, GRADE_COLORS)} style={{ height: 230 }} />
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="ui-card">
            <div className="section-title" style={{ marginBottom: 8 }}>客户来源分布</div>
            <ReactECharts option={pieOption(summary.source_dist, SOURCE_LABELS)} style={{ height: 230 }} />
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="ui-card">
            <div className="section-title" style={{ marginBottom: 8 }}>客户状态分布</div>
            <ReactECharts option={pieOption(summary.status_dist, STATUS_LABELS, STATUS_COLORS)} style={{ height: 230 }} />
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="ui-card">
            <div className="section-title" style={{ marginBottom: 8 }}>业务员跟进排行（近 30 天）</div>
            {(summary.followup_ranking ?? []).length ? (
              <ReactECharts option={rankOption} style={{ height: 230 }} />
            ) : (
              <Empty description="暂无跟进数据" />
            )}
          </div>
        </Col>
      </Row>
    </PageContainer>
  );
}
