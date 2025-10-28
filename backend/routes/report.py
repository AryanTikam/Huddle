from flask import Blueprint, send_file, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
import io
import json
import csv
import zipfile
import re

report_bp = Blueprint('report', __name__)

def is_valid_objectid(id_string):
    """Check if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except (InvalidId, TypeError):
        return False

def parse_markdown_for_pdf(markdown_text):
    """Parse markdown text and convert to ReportLab flowables with enhanced styling"""
    if not markdown_text:
        return []
    
    styles = getSampleStyleSheet()
    
    # Enhanced custom styles for different elements
    h1_style = ParagraphStyle(
        'CustomHeading1',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=16,
        spaceBefore=12,
        textColor=colors.HexColor('#1E40AF'),
        fontName='Helvetica-Bold',
        borderPadding=8,
        borderColor=colors.HexColor('#DBEAFE'),
        borderWidth=0,
        backColor=colors.HexColor('#EFF6FF'),
        borderRadius=4
    )
    
    h2_style = ParagraphStyle(
        'CustomHeading2',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        spaceBefore=10,
        textColor=colors.HexColor('#1F2937'),
        fontName='Helvetica-Bold',
        leftIndent=0
    )
    
    h3_style = ParagraphStyle(
        'CustomHeading3',
        parent=styles['Heading3'],
        fontSize=12,
        spaceAfter=8,
        spaceBefore=8,
        textColor=colors.HexColor('#374151'),
        fontName='Helvetica-Bold',
        leftIndent=0
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=8,
        textColor=colors.HexColor('#1F2937'),
        leading=14,
        alignment=0
    )
    
    bullet_style = ParagraphStyle(
        'BulletStyle',
        parent=normal_style,
        leftIndent=20,
        bulletIndent=10,
        spaceAfter=4
    )
    
    flowables = []
    lines = markdown_text.split('\n')
    current_list_items = []
    
    for line in lines:
        line = line.strip()
        if not line:
            if current_list_items:
                for item in current_list_items:
                    flowables.append(Paragraph(f"• {item}", bullet_style))
                current_list_items = []
            flowables.append(Spacer(1, 6))
            continue
        
        # Headers with different levels
        if line.startswith('### '):
            if current_list_items:
                for item in current_list_items:
                    flowables.append(Paragraph(f"• {item}", bullet_style))
                current_list_items = []
            flowables.append(Paragraph(line[4:], h3_style))
        elif line.startswith('## '):
            if current_list_items:
                for item in current_list_items:
                    flowables.append(Paragraph(f"• {item}", bullet_style))
                current_list_items = []
            flowables.append(Paragraph(line[3:], h2_style))
        elif line.startswith('# '):
            if current_list_items:
                for item in current_list_items:
                    flowables.append(Paragraph(f"• {item}", bullet_style))
                current_list_items = []
            flowables.append(Paragraph(line[2:], h1_style))
        # Bullet points
        elif line.startswith('* ') or line.startswith('- '):
            current_list_items.append(line[2:])
        # Numbered lists
        elif re.match(r'^\d+\. ', line):
            current_list_items.append(re.sub(r'^\d+\. ', '', line))
        else:
            if current_list_items:
                for item in current_list_items:
                    flowables.append(Paragraph(f"• {item}", bullet_style))
                current_list_items = []
            
            # Process bold and italic text
            processed_line = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', line)
            processed_line = re.sub(r'\*(.*?)\*', r'<i>\1</i>', processed_line)
            flowables.append(Paragraph(processed_line, normal_style))
    
    # Handle remaining list items
    if current_list_items:
        for item in current_list_items:
            flowables.append(Paragraph(f"• {item}", bullet_style))
    
    return flowables

def parse_structured_content_for_pdf(content, styles):
    """Parse structured JSON content and create beautiful PDF flowables"""
    flowables = []
    
    if not content or content == 'No summary available' or content == 'No minutes available' or content == 'No insights available':
        return [Paragraph(str(content), styles['Normal'])]
    
    # If it's a string (markdown), parse as before
    if isinstance(content, str):
        return parse_markdown_for_pdf(content)
    
    # Handle structured data (JSON objects)
    if isinstance(content, dict):
        # Summary structure
        if 'executive_summary' in content or 'key_points' in content:
            flowables.extend(_render_summary_structure(content, styles))
        # Minutes structure
        elif 'meeting_info' in content or 'attendees' in content:
            flowables.extend(_render_minutes_structure(content, styles))
        # Insights structure
        elif 'overview' in content or 'key_themes' in content:
            flowables.extend(_render_insights_structure(content, styles))
        else:
            # Generic dictionary rendering
            flowables.extend(_render_generic_dict(content, styles))
    
    return flowables if flowables else [Paragraph(json.dumps(content, indent=2), styles['Normal'])]

def _render_summary_structure(summary, styles):
    """Render summary JSON structure beautifully"""
    flowables = []
    
    # Metrics section
    if summary.get('metrics'):
        metrics = summary['metrics']
        metrics_data = [
            ['Metric', 'Value'],
            ['Topics Discussed', str(metrics.get('total_topics', 0))],
            ['Decisions Made', str(metrics.get('decisions_made', 0))],
            ['Action Items', str(metrics.get('action_items', 0))]
        ]
        
        metrics_table = Table(metrics_data, colWidths=[3*inch, 2*inch])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F3F4F6')),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1F2937')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB'))
        ]))
        flowables.append(metrics_table)
        flowables.append(Spacer(1, 16))
    
    # Executive Summary
    if summary.get('executive_summary'):
        exec_style = ParagraphStyle(
            'ExecSummary',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor('#1E40AF'),
            spaceAfter=8
        )
        flowables.append(Paragraph("Executive Summary", exec_style))
        
        summary_box_style = ParagraphStyle(
            'SummaryBox',
            parent=styles['Normal'],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor('#1F2937'),
            leftIndent=15,
            rightIndent=15,
            spaceAfter=12,
            backColor=colors.HexColor('#EFF6FF'),
            borderPadding=10
        )
        flowables.append(Paragraph(summary['executive_summary'], summary_box_style))
        flowables.append(Spacer(1, 12))
    
    # Key Points
    if summary.get('key_points'):
        flowables.append(Paragraph("Key Discussion Points", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, point in enumerate(summary['key_points'], 1):
            point_data = [
                [f"{i}.", point.get('point', 'N/A')],
                ['', f"Priority: {point.get('importance', 'N/A').upper()}"]
            ]
            
            point_table = Table(point_data, colWidths=[0.3*inch, 5.7*inch])
            
            # Color based on priority
            priority_color = colors.HexColor('#FEE2E2') if point.get('importance') == 'high' else \
                           colors.HexColor('#FEF3C7') if point.get('importance') == 'medium' else \
                           colors.HexColor('#DBEAFE')
            
            point_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), priority_color),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F2937')),
                ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB'))
            ]))
            flowables.append(point_table)
            flowables.append(Spacer(1, 6))
        
        flowables.append(Spacer(1, 12))
    
    # Decisions
    if summary.get('decisions'):
        flowables.append(Paragraph("✓ Decisions Made", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, decision in enumerate(summary['decisions'], 1):
            decision_style = ParagraphStyle('Decision', parent=styles['Normal'], fontSize=10, leading=13)
            flowables.append(Paragraph(f"<b>{i}. {decision.get('decision', 'N/A')}</b>", decision_style))
            if decision.get('context'):
                context_style = ParagraphStyle('Context', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#6B7280'), leftIndent=15)
                flowables.append(Paragraph(decision['context'], context_style))
            flowables.append(Spacer(1, 8))
        
        flowables.append(Spacer(1, 12))
    
    # Action Items
    if summary.get('action_items'):
        flowables.append(Paragraph("Action Items", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        action_data = [['#', 'Task', 'Owner', 'Deadline', 'Priority']]
        for i, item in enumerate(summary['action_items'], 1):
            action_data.append([
                str(i),
                item.get('task', 'N/A'),
                item.get('owner', 'N/A'),
                item.get('deadline', 'N/A'),
                item.get('priority', 'N/A').upper()
            ])
        
        action_table = Table(action_data, colWidths=[0.3*inch, 2.5*inch, 1.5*inch, 1*inch, 0.7*inch])
        action_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7C3AED')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1F2937')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP')
        ]))
        flowables.append(action_table)
        flowables.append(Spacer(1, 12))
    
    # Next Steps
    if summary.get('next_steps'):
        flowables.append(Paragraph("Next Steps", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, step in enumerate(summary['next_steps'], 1):
            step_style = ParagraphStyle('Step', parent=styles['Normal'], fontSize=10, leftIndent=20, bulletIndent=10)
            flowables.append(Paragraph(f"{i}. {step}", step_style))
        flowables.append(Spacer(1, 12))
    
    return flowables

def _render_minutes_structure(minutes, styles):
    """Render minutes JSON structure beautifully"""
    flowables = []
    
    # Meeting Info
    if minutes.get('meeting_info'):
        info = minutes['meeting_info']
        info_data = []
        if info.get('date'):
            info_data.append(['Date:', info['date']])
        if info.get('time'):
            info_data.append(['Time:', info['time']])
        if info.get('duration'):
            info_data.append(['Duration:', info['duration']])
        if info.get('location'):
            info_data.append(['Location:', info['location']])
        
        if info_data:
            info_table = Table(info_data, colWidths=[1.5*inch, 4.5*inch])
            info_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#DBEAFE')),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB'))
            ]))
            flowables.append(info_table)
            flowables.append(Spacer(1, 16))
    
    # Attendees
    if minutes.get('attendees'):
        flowables.append(Paragraph("Attendees", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        attendee_data = [['Name', 'Role']]
        for attendee in minutes['attendees']:
            attendee_data.append([
                attendee.get('name', 'N/A'),
                attendee.get('role', '-')
            ])
        
        attendee_table = Table(attendee_data, colWidths=[3*inch, 3*inch])
        attendee_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F9FAFB')),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB'))
        ]))
        flowables.append(attendee_table)
        flowables.append(Spacer(1, 16))
    
    # Agenda Items
    if minutes.get('agenda_items'):
        flowables.append(Paragraph("Agenda", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, item in enumerate(minutes['agenda_items'], 1):
            agenda_text = f"{i}. {item.get('item', 'N/A')}"
            if item.get('presenter'):
                agenda_text += f" (Presenter: {item['presenter']})"
            if item.get('duration'):
                agenda_text += f" - {item['duration']}"
            
            flowables.append(Paragraph(agenda_text, styles['Normal']))
        flowables.append(Spacer(1, 16))
    
    # Discussion Points
    if minutes.get('discussion_points'):
        flowables.append(Paragraph("Discussion Points", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for point in minutes['discussion_points']:
            topic_style = ParagraphStyle('Topic', parent=styles['Normal'], fontSize=11, textColor=colors.HexColor('#1E40AF'), fontName='Helvetica-Bold')
            flowables.append(Paragraph(point.get('topic', 'N/A'), topic_style))
            
            if point.get('summary'):
                flowables.append(Paragraph(point['summary'], styles['Normal']))
            
            if point.get('key_points'):
                for kp in point['key_points']:
                    kp_style = ParagraphStyle('KP', parent=styles['Normal'], fontSize=9, leftIndent=20)
                    flowables.append(Paragraph(f"• {kp}", kp_style))
            
            flowables.append(Spacer(1, 10))
        flowables.append(Spacer(1, 12))
    
    # Decisions
    if minutes.get('decisions'):
        flowables.append(Paragraph("Decisions Made", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, decision in enumerate(minutes['decisions'], 1):
            dec_style = ParagraphStyle('Decision', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#059669'), fontName='Helvetica-Bold')
            flowables.append(Paragraph(f"{i}. {decision.get('decision', 'N/A')}", dec_style))
            
            if decision.get('rationale'):
                rat_style = ParagraphStyle('Rationale', parent=styles['Normal'], fontSize=9, leftIndent=15)
                flowables.append(Paragraph(f"Rationale: {decision['rationale']}", rat_style))
            
            flowables.append(Spacer(1, 8))
        flowables.append(Spacer(1, 12))
    
    # Action Items  (similar to summary)
    if minutes.get('action_items'):
        flowables.append(Paragraph("Action Items", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        action_data = [['#', 'Task', 'Assignee', 'Deadline', 'Status']]
        for i, item in enumerate(minutes['action_items'], 1):
            action_data.append([
                str(i),
                item.get('task', 'N/A'),
                item.get('assignee', 'N/A'),
                item.get('deadline', 'N/A'),
                item.get('status', 'pending').upper()
            ])
        
        action_table = Table(action_data, colWidths=[0.3*inch, 2.5*inch, 1.5*inch, 1*inch, 0.7*inch])
        action_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F59E0B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP')
        ]))
        flowables.append(action_table)
        flowables.append(Spacer(1, 12))
    
    return flowables

def _render_insights_structure(insights, styles):
    """Render insights JSON structure beautifully"""
    flowables = []
    
    # Overview with metrics
    if insights.get('overview'):
        overview = insights['overview']
        overview_data = []
        
        if overview.get('meeting_effectiveness_score'):
            overview_data.append(['Effectiveness Score', f"{overview['meeting_effectiveness_score']}/10"])
        if overview.get('overall_sentiment'):
            overview_data.append(['Overall Sentiment', overview['overall_sentiment'].upper()])
        if overview.get('engagement_level'):
            overview_data.append(['Engagement Level', overview['engagement_level'].upper()])
        
        if overview_data:
            overview_table = Table(overview_data, colWidths=[3*inch, 3*inch])
            overview_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F3E8FF')),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 11),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB'))
            ]))
            flowables.append(overview_table)
            flowables.append(Spacer(1, 16))
        
        if overview.get('summary'):
            summary_style = ParagraphStyle('InsightSummary', parent=styles['Normal'], fontSize=10, leading=14, backColor=colors.HexColor('#F3E8FF'), borderPadding=10)
            flowables.append(Paragraph(overview['summary'], summary_style))
            flowables.append(Spacer(1, 16))
    
    # Key Themes
    if insights.get('key_themes'):
        flowables.append(Paragraph("Key Themes & Patterns", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for theme in insights['key_themes']:
            theme_style = ParagraphStyle('Theme', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold', textColor=colors.HexColor('#7C3AED'))
            flowables.append(Paragraph(f"• {theme.get('theme', 'N/A')} (Importance: {theme.get('importance', 'N/A')}, Frequency: {theme.get('frequency', 0)}x)", theme_style))
            
            if theme.get('description'):
                desc_style = ParagraphStyle('ThemeDesc', parent=styles['Normal'], fontSize=9, leftIndent=20)
                flowables.append(Paragraph(theme['description'], desc_style))
            
            flowables.append(Spacer(1, 8))
        flowables.append(Spacer(1, 12))
    
    # Participation Analysis
    if insights.get('participation_analysis'):
        participation = insights['participation_analysis']
        flowables.append(Paragraph("Participation Analysis", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        if participation.get('most_active_speakers'):
            speaker_data = [['Speaker', 'Contribution %']]
            for speaker in participation['most_active_speakers']:
                speaker_data.append([
                    speaker.get('name', 'N/A'),
                    f"{speaker.get('contribution_percentage', 0)}%"
                ])
            
            speaker_table = Table(speaker_data, colWidths=[4*inch, 2*inch])
            speaker_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB'))
            ]))
            flowables.append(speaker_table)
            flowables.append(Spacer(1, 12))
    
    # Sentiment Analysis
    if insights.get('sentiment_analysis'):
        sentiment = insights['sentiment_analysis']
        flowables.append(Paragraph("Sentiment Analysis", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        if sentiment.get('overall_tone'):
            tone_style = ParagraphStyle('Tone', parent=styles['Normal'], fontSize=12, fontName='Helvetica-Bold')
            flowables.append(Paragraph(f"Overall Tone: {sentiment['overall_tone'].upper()}", tone_style))
            flowables.append(Spacer(1, 12))
        
        if sentiment.get('positive_moments'):
            flowables.append(Paragraph("Positive Moments:", styles['Heading3']))
            for moment in sentiment['positive_moments']:
                flowables.append(Paragraph(f"✓ {moment.get('moment', 'N/A')}", styles['Normal']))
            flowables.append(Spacer(1, 8))
        
        if sentiment.get('concerns_raised'):
            flowables.append(Paragraph("Concerns Raised:", styles['Heading3']))
            for concern in sentiment['concerns_raised']:
                flowables.append(Paragraph(f"⚠ {concern.get('concern', 'N/A')} (Severity: {concern.get('severity', 'N/A')})", styles['Normal']))
            flowables.append(Spacer(1, 12))
    
    # Risks and Concerns
    if insights.get('risks_and_concerns'):
        flowables.append(Paragraph("Risks & Concerns", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, risk in enumerate(insights['risks_and_concerns'], 1):
            risk_style = ParagraphStyle('Risk', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#DC2626'), fontName='Helvetica-Bold')
            flowables.append(Paragraph(f"{i}. {risk.get('risk', 'N/A')} (Impact: {risk.get('impact', 'N/A')})", risk_style))
            
            if risk.get('mitigation'):
                mit_style = ParagraphStyle('Mitigation', parent=styles['Normal'], fontSize=9, leftIndent=20)
                flowables.append(Paragraph(f"Mitigation: {risk['mitigation']}", mit_style))
            
            flowables.append(Spacer(1, 8))
        flowables.append(Spacer(1, 12))
    
    # Follow-up Recommendations
    if insights.get('follow_up_recommendations'):
        flowables.append(Paragraph("Follow-up Recommendations", styles['Heading2']))
        flowables.append(Spacer(1, 8))
        
        for i, rec in enumerate(insights['follow_up_recommendations'], 1):
            rec_style = ParagraphStyle('Rec', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold')
            flowables.append(Paragraph(f"{i}. {rec.get('recommendation', 'N/A')} (Priority: {rec.get('priority', 'N/A')})", rec_style))
            
            if rec.get('rationale'):
                rat_style = ParagraphStyle('RecRat', parent=styles['Normal'], fontSize=9, leftIndent=20)
                flowables.append(Paragraph(f"Rationale: {rec['rationale']}", rat_style))
            
            flowables.append(Spacer(1, 8))
        flowables.append(Spacer(1, 12))
    
    return flowables

def _render_generic_dict(data, styles):
    """Render any generic dictionary as formatted text"""
    flowables = []
    
    for key, value in data.items():
        key_style = ParagraphStyle('DictKey', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold', textColor=colors.HexColor('#1E40AF'))
        flowables.append(Paragraph(key.replace('_', ' ').title() + ':', key_style))
        
        if isinstance(value, (list, dict)):
            value_text = json.dumps(value, indent=2)
        else:
            value_text = str(value)
        
        value_style = ParagraphStyle('DictValue', parent=styles['Normal'], fontSize=9, leftIndent=20)
        flowables.append(Paragraph(value_text, value_style))
        flowables.append(Spacer(1, 8))
    
    return flowables

@report_bp.route('/<meeting_id>/<format_type>', methods=['GET'])
@jwt_required()
def download_report(meeting_id, format_type):
    user_id = get_jwt_identity()
    
    # Verify meeting ownership
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    meeting = current_app.mongo.db.meetings.find_one(query)
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Get all meeting data
    search_id = meeting.get('id', str(meeting['_id']))
    transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': search_id})
    summary_doc = current_app.mongo.db.summaries.find_one({'meeting_id': search_id})
    knowledge_graph_doc = current_app.mongo.db.knowledge_graphs.find_one({'meeting_id': search_id})
    
    transcript = transcript_doc.get('transcript', '') if transcript_doc else 'No transcript available'
    summary = summary_doc.get('summary', '') if summary_doc else 'No summary available'
    knowledge_graph = knowledge_graph_doc.get('graph', {}) if knowledge_graph_doc else {}
    
    try:
        if format_type == 'pdf':
            return generate_pdf_report(meeting, transcript, summary, knowledge_graph)
        elif format_type == 'json':
            return generate_json_report(meeting, transcript, summary, knowledge_graph)
        elif format_type == 'csv':
            return generate_csv_report(meeting, transcript, summary, knowledge_graph)
        elif format_type == 'txt':
            return generate_txt_report(meeting, transcript, summary, knowledge_graph)
        else:
            return jsonify({'error': 'Invalid format type'}), 400
    except Exception as e:
        print(f"Error generating report: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate report: {str(e)}'}), 500

def generate_pdf_report(meeting, transcript, summary, knowledge_graph):
    """Generate PDF report using ReportLab with markdown parsing"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30,
        textColor=colors.HexColor('#2563EB')
    )
    story.append(Paragraph(f"Meeting Report: {meeting.get('title', 'Untitled')}", title_style))
    story.append(Spacer(1, 20))
    
    # Meeting Info Table
    meeting_info = [
        ['Meeting ID:', meeting.get('id', 'N/A')],
        ['Date:', _format_datetime_for_display(meeting.get('created_at'))],
        ['Language:', meeting.get('language', 'N/A')],
        ['Status:', meeting.get('status', 'N/A')],
        ['Duration:', _calculate_duration(meeting)]
    ]
    
    info_table = Table(meeting_info, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Summary Section with markdown parsing
    if summary and summary != 'No summary available':
        summary_heading = ParagraphStyle(
            'SummaryHeading',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=20,
            textColor=colors.HexColor('#1F2937')
        )
        story.append(Paragraph("Meeting Summary", summary_heading))
        story.append(Spacer(1, 12))
        
        # Parse and add markdown content
        summary_flowables = parse_markdown_for_pdf(summary)
        story.extend(summary_flowables)
        story.append(Spacer(1, 20))
    
    # Knowledge Graph Section
    if knowledge_graph and knowledge_graph.get('action_items'):
        story.append(Paragraph("Action Items", styles['Heading1']))
        story.append(Spacer(1, 12))
        
        for i, action in enumerate(knowledge_graph['action_items'], 1):
            action_text = f"{i}. {action.get('task', 'N/A')} - Assigned to: {action.get('assignee', 'N/A')} - Due: {action.get('due_date', 'N/A')}"
            story.append(Paragraph(action_text, styles['Normal']))
        
        story.append(Spacer(1, 20))
    
    # Transcript Section (truncated for PDF)
    if transcript and transcript != 'No transcript available':
        story.append(Paragraph("Transcript (Preview)", styles['Heading1']))
        story.append(Spacer(1, 12))
        preview = transcript[:2000] + "..." if len(transcript) > 2000 else transcript
        story.append(Paragraph(preview, styles['Normal']))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.pdf"
    )

def generate_json_report(meeting, transcript, summary, knowledge_graph):
    """Generate JSON report"""
    report_data = {
        'meeting_info': {
            'id': meeting.get('id'),
            'title': meeting.get('title'),
            'created_at': _format_datetime_for_display(meeting.get('created_at')),
            'language': meeting.get('language'),
            'status': meeting.get('status'),
            'participants': meeting.get('participants', [])
        },
        'transcript': transcript,
        'summary': summary,
        'knowledge_graph': knowledge_graph,
        'generated_at': datetime.utcnow().isoformat()
    }
    
    json_str = json.dumps(report_data, indent=2, ensure_ascii=False)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.json"
    )

def generate_csv_report(meeting, transcript, summary, knowledge_graph):
    """Generate CSV report with action items and key data"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    
    # Meeting info
    writer.writerow(['Meeting Report'])
    writer.writerow(['Title', meeting.get('title', 'N/A')])
    writer.writerow(['ID', meeting.get('id', 'N/A')])
    writer.writerow(['Date', _format_datetime_for_display(meeting.get('created_at'))])
    writer.writerow(['Language', meeting.get('language', 'N/A')])
    writer.writerow([])
    
    # Action items
    if knowledge_graph and knowledge_graph.get('action_items'):
        writer.writerow(['Action Items'])
        writer.writerow(['Task', 'Assignee', 'Due Date', 'Priority'])
        for action in knowledge_graph['action_items']:
            writer.writerow([
                action.get('task', 'N/A'),
                action.get('assignee', 'N/A'),
                action.get('due_date', 'N/A'),
                action.get('priority', 'N/A')
            ])
        writer.writerow([])
    
    # Topics
    if knowledge_graph and knowledge_graph.get('topics'):
        writer.writerow(['Topics Discussed'])
        for topic in knowledge_graph['topics']:
            writer.writerow([topic])
        writer.writerow([])
    
    # Summary
    writer.writerow(['Summary'])
    writer.writerow([summary])
    
    buffer.seek(0)
    return send_file(
        io.BytesIO(buffer.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.csv"
    )

def generate_txt_report(meeting, transcript, summary, knowledge_graph):
    """Generate plain text report"""
    report_lines = [
        f"MEETING REPORT",
        f"=" * 50,
        f"",
        f"Title: {meeting.get('title', 'N/A')}",
        f"Meeting ID: {meeting.get('id', 'N/A')}",
        f"Date: {_format_datetime_for_display(meeting.get('created_at'))}",
        f"Language: {meeting.get('language', 'N/A')}",
        f"Status: {meeting.get('status', 'N/A')}",
        f"",
        f"SUMMARY",
        f"-" * 20,
        summary,
        f"",
    ]
    
    # Action items
    if knowledge_graph and knowledge_graph.get('action_items'):
        report_lines.extend([
            f"ACTION ITEMS",
            f"-" * 20
        ])
        for i, action in enumerate(knowledge_graph['action_items'], 1):
            report_lines.append(f"{i}. {action.get('task', 'N/A')} - {action.get('assignee', 'N/A')} - {action.get('due_date', 'N/A')}")
        report_lines.append("")
    
    # Topics
    if knowledge_graph and knowledge_graph.get('topics'):
        report_lines.extend([
            f"TOPICS DISCUSSED",
            f"-" * 20
        ])
        for topic in knowledge_graph['topics']:
            report_lines.append(f"• {topic}")
        report_lines.append("")
    
    # Full transcript
    report_lines.extend([
        f"FULL TRANSCRIPT",
        f"-" * 20,
        transcript
    ])
    
    report_text = "\n".join(report_lines)
    buffer = io.BytesIO(report_text.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='text/plain',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.txt"
    )

def _calculate_duration(meeting):
    """Calculate meeting duration"""
    created = meeting.get('created_at')
    ended = meeting.get('ended_at')
    
    if created and ended:
        # Ensure both are datetime objects
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created.replace('Z', '+00:00'))
            except:
                return "N/A"
        
        if isinstance(ended, str):
            try:
                ended = datetime.fromisoformat(ended.replace('Z', '+00:00'))
            except:
                return "N/A"
        
        try:
            duration = ended - created
            hours, remainder = divmod(duration.total_seconds(), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{int(hours)}h {int(minutes)}m"
        except:
            return "N/A"
    
    return "N/A"

def _format_datetime_for_display(dt):
    """Format datetime for display"""
    if not dt:
        return 'N/A'
    
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except:
            return dt  # Return as-is if parsing fails
    
    if isinstance(dt, datetime):
        return dt.strftime('%Y-%m-%d %H:%M')
    
    return str(dt)

@report_bp.route('/bulk-export', methods=['POST'])
@jwt_required()
def bulk_export():
    user_id = get_jwt_identity()
    data = request.json
    
    meeting_ids = data.get('meeting_ids', [])
    format_type = data.get('format', 'json')
    
    if not meeting_ids:
        return jsonify({'error': 'No meetings selected'}), 400
    
    # Get all meetings
    meetings_data = []
    for meeting_id in meeting_ids:
        if _is_valid_objectid(meeting_id):
            query = {
                '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
                'user_id': user_id
            }
        else:
            query = {'id': meeting_id, 'user_id': user_id}
        
        meeting = current_app.mongo.db.meetings.find_one(query)
        if meeting:
            # Get related data
            search_id = meeting.get('id', str(meeting['_id']))
            transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': search_id})
            summary_doc = current_app.mongo.db.summaries.find_one({'meeting_id': search_id})
            knowledge_graph_doc = current_app.mongo.db.knowledge_graphs.find_one({'meeting_id': search_id})
            
            meeting_data = {
                'meeting_info': {
                    'id': meeting.get('id'),
                    'title': meeting.get('title'),
                    'created_at': _format_datetime_for_display(meeting.get('created_at')),
                    'language': meeting.get('language'),
                    'status': meeting.get('status'),
                    'participants': meeting.get('participants', [])
                },
                'transcript': transcript_doc.get('transcript', '') if transcript_doc else '',
                'summary': summary_doc.get('summary', '') if summary_doc else '',
                'knowledge_graph': knowledge_graph_doc.get('graph', {}) if knowledge_graph_doc else {}
            }
            meetings_data.append(meeting_data)
    
    try:
        if format_type == 'json':
            return _export_bulk_json(meetings_data)
        elif format_type == 'csv':
            return _export_bulk_csv(meetings_data)
        elif format_type == 'zip':
            return _export_bulk_zip(meetings_data, 'txt')
        else:
            return jsonify({'error': 'Invalid format type'}), 400
    except Exception as e:
        print(f"Error in bulk export: {e}")
        return jsonify({'error': f'Failed to export meetings: {str(e)}'}), 500

def _is_valid_objectid(id_string):
    """Check if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except:
        return False

def _export_bulk_json(meetings_data):
    """Export all meetings as a single JSON file"""
    export_data = {
        'export_info': {
            'generated_at': datetime.utcnow().isoformat(),
            'total_meetings': len(meetings_data),
            'format': 'json'
        },
        'meetings': meetings_data
    }
    
    json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"meetings_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    )

def _export_bulk_csv(meetings_data):
    """Export all meetings as CSV"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    
    # Headers
    writer.writerow([
        'Meeting ID', 'Title', 'Date', 'Language', 'Status', 
        'Participants', 'Summary', 'Action Items Count', 'Topics Count'
    ])
    
    # Data rows
    for meeting_data in meetings_data:
        meeting_info = meeting_data['meeting_info']
        kg = meeting_data.get('knowledge_graph', {})
        
        writer.writerow([
            meeting_info.get('id', 'N/A'),
            meeting_info.get('title', 'N/A'),
            meeting_info.get('created_at', 'N/A'),
            meeting_info.get('language', 'N/A'),
            meeting_info.get('status', 'N/A'),
            ', '.join(meeting_info.get('participants', [])),
            meeting_data.get('summary', 'N/A')[:100] + '...' if len(meeting_data.get('summary', '')) > 100 else meeting_data.get('summary', 'N/A'),
            len(kg.get('action_items', [])),
            len(kg.get('topics', []))
        ])
    
    buffer.seek(0)
    return send_file(
        io.BytesIO(buffer.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"meetings_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    )

def _export_bulk_zip(meetings_data, format_type):
    """Export meetings as ZIP file with individual files"""
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for i, meeting_data in enumerate(meetings_data):
            meeting_info = meeting_data['meeting_info']
            meeting_id = meeting_info.get('id', f'meeting_{i+1}')
            
            if format_type == 'json':
                filename = f"{meeting_id}.json"
                content = json.dumps(meeting_data, indent=2, ensure_ascii=False)
                zip_file.writestr(filename, content.encode('utf-8'))
                
            elif format_type == 'txt':
                filename = f"{meeting_id}.txt"
                content = _create_txt_content(meeting_data)
                zip_file.writestr(filename, content.encode('utf-8'))
                
            elif format_type == 'csv':
                filename = f"{meeting_id}.csv"
                csv_buffer = io.StringIO()
                writer = csv.writer(csv_buffer)
                
                # Meeting info
                writer.writerow(['Meeting Report'])
                writer.writerow(['Title', meeting_info.get('title', 'N/A')])
                writer.writerow(['ID', meeting_info.get('id', 'N/A')])
                writer.writerow(['Date', meeting_info.get('created_at', 'N/A')])
                writer.writerow(['Language', meeting_info.get('language', 'N/A')])
                writer.writerow([])
                
                # Action items
                kg = meeting_data.get('knowledge_graph', {})
                if kg.get('action_items'):
                    writer.writerow(['Action Items'])
                    writer.writerow(['Task', 'Assignee', 'Due Date', 'Priority'])
                    for item in kg['action_items']:
                        writer.writerow([
                            item.get('task', ''),
                            item.get('assignee', ''),
                            item.get('due_date', ''),
                            item.get('priority', '')
                        ])
                    writer.writerow([])
                
                # Topics
                if kg.get('topics'):
                    writer.writerow(['Topics'])
                    for topic in kg['topics']:
                        writer.writerow([topic])
                    writer.writerow([])
                
                # Summary
                writer.writerow(['Summary'])
                writer.writerow([meeting_data.get('summary', 'No summary available')])
                
                content = csv_buffer.getvalue()
                zip_file.writestr(filename, content.encode('utf-8'))
    
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"meetings_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    )

def _create_txt_content(meeting_data):
    """Create text content for a meeting"""
    meeting_info = meeting_data['meeting_info']
    lines = [
        f"MEETING REPORT",
        f"=" * 50,
        f"",
        f"Title: {meeting_info.get('title', 'N/A')}",
        f"Meeting ID: {meeting_info.get('id', 'N/A')}",
        f"Date: {_format_datetime_for_display(meeting_info.get('created_at'))}",
        f"Language: {meeting_info.get('language', 'N/A')}",
        f"Status: {meeting_info.get('status', 'N/A')}",
        f"Participants: {', '.join(meeting_info.get('participants', []))}",
        f"",
        f"SUMMARY",
        f"-" * 20,
        meeting_data.get('summary', 'No summary available'),
        f"",
    ]
    
    # Add action items if available
    kg = meeting_data.get('knowledge_graph', {})
    if kg.get('action_items'):
        lines.extend([
            f"ACTION ITEMS",
            f"-" * 20
        ])
        for i, action in enumerate(kg['action_items'], 1):
            lines.append(f"{i}. {action.get('task', 'N/A')} - {action.get('assignee', 'N/A')} - {action.get('due_date', 'N/A')}")
        lines.append("")
    
    # Add topics if available
    if kg.get('topics'):
        lines.extend([
            f"TOPICS DISCUSSED",
            f"-" * 20
        ])
        for topic in kg['topics']:
            lines.append(f"• {topic}")
        lines.append("")
    
    # Add transcript
    lines.extend([
        f"FULL TRANSCRIPT",
        f"-" * 20,
        meeting_data.get('transcript', 'No transcript available')
    ])
    
    return "\n".join(lines)

@report_bp.route('/<meeting_id>/comprehensive/<format_type>', methods=['GET'])
@jwt_required()
def download_comprehensive_report(meeting_id, format_type):
    """Download comprehensive report with all meeting content"""
    user_id = get_jwt_identity()
    
    # Verify meeting ownership
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    meeting = current_app.mongo.db.meetings.find_one(query)
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Get all meeting data
    search_id = meeting.get('id', str(meeting['_id']))
    transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': search_id})
    summary_doc = current_app.mongo.db.summaries.find_one({'meeting_id': search_id})
    minutes_doc = current_app.mongo.db.minutes.find_one({'meeting_id': search_id})
    insights_doc = current_app.mongo.db.insights.find_one({'meeting_id': search_id})
    knowledge_graph_doc = current_app.mongo.db.knowledge_graphs.find_one({'meeting_id': search_id})
    
    transcript = transcript_doc.get('transcript', '') if transcript_doc else 'No transcript available'
    summary = summary_doc.get('summary', '') if summary_doc else 'No summary available'
    minutes = minutes_doc.get('minutes', '') if minutes_doc else 'No minutes available'
    insights = insights_doc.get('insights', '') if insights_doc else 'No insights available'
    knowledge_graph = knowledge_graph_doc.get('graph', {}) if knowledge_graph_doc else {}
    
    try:
        if format_type == 'pdf':
            return generate_comprehensive_pdf(meeting, transcript, summary, minutes, insights, knowledge_graph)
        elif format_type == 'json':
            return generate_comprehensive_json(meeting, transcript, summary, minutes, insights, knowledge_graph)
        elif format_type == 'txt':
            return generate_comprehensive_txt(meeting, transcript, summary, minutes, insights, knowledge_graph)
        else:
            return jsonify({'error': 'Invalid format type'}), 400
    except Exception as e:
        print(f"Error generating comprehensive report: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate report: {str(e)}'}), 500

@report_bp.route('/<meeting_id>/<content_type>/<format_type>', methods=['GET'])
@jwt_required()
def download_specific_content(meeting_id, content_type, format_type):
    """Download specific content (transcript, summary, minutes, insights)"""
    user_id = get_jwt_identity()
    
    # Verify meeting ownership
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    meeting = current_app.mongo.db.meetings.find_one(query)
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    search_id = meeting.get('id', str(meeting['_id']))
    
    # Get specific content based on type
    content = None
    content_data = {}
    
    if content_type == 'transcript':
        doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': search_id})
        content = doc.get('transcript', 'No transcript available') if doc else 'No transcript available'
        content_data = {'transcript': content}
    elif content_type == 'summary':
        doc = current_app.mongo.db.summaries.find_one({'meeting_id': search_id})
        content = doc.get('summary', 'No summary available') if doc else 'No summary available'
        content_data = {'summary': content}
    elif content_type == 'minutes':
        doc = current_app.mongo.db.minutes.find_one({'meeting_id': search_id})
        content = doc.get('minutes', 'No minutes available') if doc else 'No minutes available'
        content_data = {'minutes': content}
    elif content_type == 'insights':
        doc = current_app.mongo.db.insights.find_one({'meeting_id': search_id})
        content = doc.get('insights', 'No insights available') if doc else 'No insights available'
        content_data = {'insights': content}
    else:
        return jsonify({'error': 'Invalid content type'}), 400
    
    try:
        if format_type == 'pdf':
            return generate_specific_pdf(meeting, content_type, content, content_data)
        elif format_type == 'json':
            return generate_specific_json(meeting, content_type, content, content_data)
        elif format_type == 'txt':
            return generate_specific_txt(meeting, content_type, content, content_data)
        else:
            return jsonify({'error': 'Invalid format type'}), 400
    except Exception as e:
        print(f"Error generating {content_type} report: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate report: {str(e)}'}), 500

def generate_comprehensive_pdf(meeting, transcript, summary, minutes, insights, knowledge_graph):
    """Generate comprehensive PDF with all meeting content and enhanced formatting"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        topMargin=0.75*inch, 
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )
    styles = getSampleStyleSheet()
    story = []
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=28,
        spaceAfter=12,
        textColor=colors.HexColor('#1E40AF'),
        fontName='Helvetica-Bold',
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=16,
        spaceAfter=30,
        textColor=colors.HexColor('#6B7280'),
        fontName='Helvetica',
        alignment=1
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading1'],
        fontSize=20,
        spaceAfter=16,
        spaceBefore=20,
        textColor=colors.white,
        fontName='Helvetica-Bold',
        backColor=colors.HexColor('#2563EB'),
        borderPadding=10,
        borderRadius=4
    )
    
    # Cover Page
    story.append(Spacer(1, 2*inch))
    story.append(Paragraph("📋 Complete Meeting Report", title_style))
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(f"{meeting.get('title', 'Untitled Meeting')}", subtitle_style))
    story.append(Spacer(1, 0.5*inch))
    
    # Meeting metadata box
    metadata_data = [
        ['Meeting ID:', meeting.get('id', 'N/A')],
        ['Date & Time:', _format_datetime_for_display(meeting.get('created_at'))],
        ['Duration:', _calculate_duration(meeting)],
        ['Status:', meeting.get('status', 'N/A').upper()],
        ['Language:', meeting.get('language', 'N/A')],
    ]
    
    metadata_table = Table(metadata_data, colWidths=[2*inch, 4*inch])
    metadata_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#EFF6FF')),
        ('BACKGROUND', (1, 0), (1, -1), colors.white),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F2937')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('BOX', (0, 0), (-1, -1), 2, colors.HexColor('#2563EB')),
    ]))
    story.append(metadata_table)
    
    # Page break after cover
    from reportlab.platypus import PageBreak
    story.append(PageBreak())
    
    # Table of Contents
    story.append(Paragraph("📑 Table of Contents", section_heading))
    story.append(Spacer(1, 12))
    
    toc_data = []
    page_num = 2
    if summary and summary != 'No summary available':
        toc_data.append(['1.', 'Meeting Summary', f'Page {page_num}'])
        page_num += 2
    if minutes and minutes != 'No minutes available':
        toc_data.append(['2.', 'Minutes of Meeting', f'Page {page_num}'])
        page_num += 2
    if insights and insights != 'No insights available':
        toc_data.append(['3.', 'Meeting Insights', f'Page {page_num}'])
        page_num += 2
    if transcript and transcript != 'No transcript available':
        toc_data.append(['4.', 'Full Transcript', f'Page {page_num}'])
    
    if toc_data:
        toc_table = Table(toc_data, colWidths=[0.5*inch, 4*inch, 1.5*inch])
        toc_table.setStyle(TableStyle([
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ]))
        story.append(toc_table)
    
    story.append(PageBreak())
    
    # Summary Section
    if summary and summary != 'No summary available':
        story.append(Paragraph("📊 Meeting Summary", section_heading))
        story.append(Spacer(1, 16))
        
        summary_flowables = parse_structured_content_for_pdf(summary, styles)
        story.extend(summary_flowables)
        story.append(PageBreak())
    
    # Minutes Section
    if minutes and minutes != 'No minutes available':
        story.append(Paragraph("📝 Minutes of Meeting", section_heading))
        story.append(Spacer(1, 16))
        
        minutes_flowables = parse_structured_content_for_pdf(minutes, styles)
        story.extend(minutes_flowables)
        story.append(PageBreak())
    
    # Insights Section
    if insights and insights != 'No insights available':
        story.append(Paragraph("💡 Meeting Insights", section_heading))
        story.append(Spacer(1, 16))
        
        insights_flowables = parse_structured_content_for_pdf(insights, styles)
        story.extend(insights_flowables)
        story.append(PageBreak())
    
    # Transcript Section
    if transcript and transcript != 'No transcript available':
        story.append(Paragraph("💬 Full Transcript", section_heading))
        story.append(Spacer(1, 16))
        
        transcript_style = ParagraphStyle(
            'TranscriptStyle', 
            parent=styles['Normal'], 
            fontSize=9,
            leading=12,
            textColor=colors.HexColor('#374151'),
            leftIndent=10,
            rightIndent=10,
            spaceAfter=6
        )
        
        # Split transcript into paragraphs for better formatting
        transcript_paragraphs = transcript.split('\n\n')
        for para in transcript_paragraphs:
            if para.strip():
                story.append(Paragraph(para.replace('\n', '<br/>'), transcript_style))
                story.append(Spacer(1, 8))
    
    # Footer with generation info
    story.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#9CA3AF'),
        alignment=1
    )
    story.append(Paragraph(f"Generated on {datetime.utcnow().strftime('%B %d, %Y at %I:%M %p UTC')}", footer_style))
    
    # Build PDF with page numbers
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.HexColor('#6B7280'))
        page_num = canvas.getPageNumber()
        text = f"Page {page_num}"
        canvas.drawRightString(7.5*inch, 0.5*inch, text)
        canvas.restoreState()
    
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    buffer.seek(0)
    
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'complete')}_full_report.pdf"
    )

def generate_comprehensive_json(meeting, transcript, summary, minutes, insights, knowledge_graph):
    """Generate comprehensive JSON with all content"""
    report_data = {
        'meeting_info': {
            'id': meeting.get('id'),
            'title': meeting.get('title'),
            'created_at': _format_datetime_for_display(meeting.get('created_at')),
            'language': meeting.get('language'),
            'status': meeting.get('status'),
            'participants': meeting.get('participants', []),
            'duration': _calculate_duration(meeting)
        },
        'transcript': transcript,
        'summary': summary,
        'minutes': minutes,
        'insights': insights,
        'knowledge_graph': knowledge_graph,
        'generated_at': datetime.utcnow().isoformat()
    }
    
    json_str = json.dumps(report_data, indent=2, ensure_ascii=False)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'complete')}_full_report.json"
    )

def generate_comprehensive_txt(meeting, transcript, summary, minutes, insights, knowledge_graph):
    """Generate comprehensive TXT with all content"""
    lines = [
        "=" * 80,
        "COMPLETE MEETING REPORT",
        "=" * 80,
        "",
        f"Title: {meeting.get('title', 'N/A')}",
        f"Meeting ID: {meeting.get('id', 'N/A')}",
        f"Date: {_format_datetime_for_display(meeting.get('created_at'))}",
        f"Language: {meeting.get('language', 'N/A')}",
        f"Status: {meeting.get('status', 'N/A')}",
        f"Duration: {_calculate_duration(meeting)}",
        f"Participants: {', '.join(meeting.get('participants', []))}",
        "",
        "=" * 80,
        "MEETING SUMMARY",
        "=" * 80,
        "",
        summary if isinstance(summary, str) else json.dumps(summary, indent=2),
        "",
        "=" * 80,
        "MINUTES OF MEETING",
        "=" * 80,
        "",
        minutes if isinstance(minutes, str) else json.dumps(minutes, indent=2),
        "",
        "=" * 80,
        "MEETING INSIGHTS",
        "=" * 80,
        "",
        insights if isinstance(insights, str) else json.dumps(insights, indent=2),
        "",
        "=" * 80,
        "FULL TRANSCRIPT",
        "=" * 80,
        "",
        transcript,
        ""
    ]
    
    report_text = "\n".join(lines)
    buffer = io.BytesIO(report_text.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='text/plain',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'complete')}_full_report.txt"
    )

def generate_specific_pdf(meeting, content_type, content, content_data):
    """Generate PDF for specific content type with enhanced formatting"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )
    styles = getSampleStyleSheet()
    story = []
    
    # Custom title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=12,
        textColor=colors.HexColor('#1E40AF'),
        fontName='Helvetica-Bold',
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=14,
        spaceAfter=30,
        textColor=colors.HexColor('#6B7280'),
        fontName='Helvetica',
        alignment=1
    )
    
    # Icon mapping for content types
    icons = {
        'transcript': '💬',
        'summary': '📊',
        'minutes': '📝',
        'insights': '💡'
    }
    
    icon = icons.get(content_type, '📄')
    title_text = content_type.replace('_', ' ').title()
    
    # Title page
    story.append(Spacer(1, 1.5*inch))
    story.append(Paragraph(f"{icon} {title_text}", title_style))
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph(f"{meeting.get('title', 'Untitled Meeting')}", subtitle_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Meeting info box
    info_data = [
        ['Meeting ID:', meeting.get('id', 'N/A')],
        ['Date:', _format_datetime_for_display(meeting.get('created_at'))],
        ['Status:', meeting.get('status', 'N/A').upper()]
    ]
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#EFF6FF')),
        ('BACKGROUND', (1, 0), (1, -1), colors.white),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1F2937')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('BOX', (0, 0), (-1, -1), 2, colors.HexColor('#2563EB')),
    ]))
    story.append(info_table)
    
    from reportlab.platypus import PageBreak
    story.append(PageBreak())
    
    # Content
    content_flowables = parse_structured_content_for_pdf(content, styles)
    story.extend(content_flowables)
    
    # Footer
    story.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#9CA3AF'),
        alignment=1
    )
    story.append(Paragraph(f"Generated on {datetime.utcnow().strftime('%B %d, %Y at %I:%M %p UTC')}", footer_style))
    
    # Build with page numbers
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.HexColor('#6B7280'))
        page_num = canvas.getPageNumber()
        text = f"Page {page_num}"
        canvas.drawRightString(7.5*inch, 0.5*inch, text)
        canvas.restoreState()
    
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    buffer.seek(0)
    
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"{content_type}_{meeting.get('id')}.pdf"
    )