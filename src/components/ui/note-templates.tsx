"use client";

import React, { useState } from "react";
import {
  IconTemplate,
  IconX,
  IconNotes,
  IconChecklist,
  IconCalendar,
  IconBulb,
  IconTargetArrow,
  IconUsers,
  IconCode,
  IconArticle,
} from "@tabler/icons-react";

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  content: string;
  category: "productivity" | "personal" | "work" | "creative";
}

const TEMPLATES: NoteTemplate[] = [
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    description: "Structured format for capturing meeting details and action items",
    icon: <IconUsers size={24} />,
    category: "work",
    content: `<h2>Meeting Notes</h2>
<p><strong>Date:</strong> [Date]</p>
<p><strong>Attendees:</strong> [Names]</p>
<p><strong>Topic:</strong> [Meeting Topic]</p>

<h3>Agenda</h3>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
  <li>Item 3</li>
</ul>

<h3>Discussion Points</h3>
<p>[Key points discussed]</p>

<h3>Action Items</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Action item 1 - @Person - Due: [Date]</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Action item 2 - @Person - Due: [Date]</p></div></li>
</ul>

<h3>Next Steps</h3>
<p>[Follow-up actions and next meeting date]</p>`,
  },
  {
    id: "daily-journal",
    name: "Daily Journal",
    description: "Reflect on your day with gratitude and goals",
    icon: <IconCalendar size={24} />,
    category: "personal",
    content: `<h2>Daily Journal</h2>
<p><strong>Date:</strong> [Today's Date]</p>

<h3>🙏 Gratitude</h3>
<p>Three things I'm grateful for today:</p>
<ol>
  <li></li>
  <li></li>
  <li></li>
</ol>

<h3>🎯 Today's Goals</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Goal 1</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Goal 2</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Goal 3</p></div></li>
</ul>

<h3>📝 Notes & Reflections</h3>
<p>[Your thoughts for the day]</p>

<h3>💭 Tomorrow's Focus</h3>
<p>[What you want to accomplish tomorrow]</p>`,
  },
  {
    id: "todo-list",
    name: "To-Do List",
    description: "Simple task list with priorities",
    icon: <IconChecklist size={24} />,
    category: "productivity",
    content: `<h2>To-Do List</h2>

<h3>🔴 High Priority</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Important task 1</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Important task 2</p></div></li>
</ul>

<h3>🟡 Medium Priority</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Task 1</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Task 2</p></div></li>
</ul>

<h3>🟢 Low Priority</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Nice to have 1</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Nice to have 2</p></div></li>
</ul>

<h3>📅 Upcoming</h3>
<ul>
  <li>Future task 1 - [Date]</li>
  <li>Future task 2 - [Date]</li>
</ul>`,
  },
  {
    id: "project-brief",
    name: "Project Brief",
    description: "Outline a new project with goals and milestones",
    icon: <IconTargetArrow size={24} />,
    category: "work",
    content: `<h2>Project Brief</h2>

<h3>Project Overview</h3>
<p><strong>Project Name:</strong> [Name]</p>
<p><strong>Start Date:</strong> [Date]</p>
<p><strong>Target Completion:</strong> [Date]</p>
<p><strong>Project Lead:</strong> [Name]</p>

<h3>Objectives</h3>
<p>What are we trying to achieve?</p>
<ul>
  <li>Objective 1</li>
  <li>Objective 2</li>
  <li>Objective 3</li>
</ul>

<h3>Scope</h3>
<p><strong>In Scope:</strong></p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
<p><strong>Out of Scope:</strong></p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>

<h3>Milestones</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Milestone 1 - [Date]</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Milestone 2 - [Date]</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Milestone 3 - [Date]</p></div></li>
</ul>

<h3>Resources Needed</h3>
<ul>
  <li>Resource 1</li>
  <li>Resource 2</li>
</ul>

<h3>Risks & Mitigations</h3>
<p>[Identify potential risks and how to address them]</p>`,
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    description: "Capture and organize ideas freely",
    icon: <IconBulb size={24} />,
    category: "creative",
    content: `<h2>Brainstorm Session</h2>
<p><strong>Topic:</strong> [What are we brainstorming?]</p>
<p><strong>Date:</strong> [Date]</p>

<h3>💡 Ideas</h3>
<p>Dump all ideas here, no filtering:</p>
<ul>
  <li>Idea 1</li>
  <li>Idea 2</li>
  <li>Idea 3</li>
  <li>Idea 4</li>
  <li>Idea 5</li>
</ul>

<h3>🌟 Top 3 Ideas</h3>
<ol>
  <li><strong>Best idea:</strong> [Why it's good]</li>
  <li><strong>Second best:</strong> [Why it's good]</li>
  <li><strong>Third best:</strong> [Why it's good]</li>
</ol>

<h3>🔍 Questions to Explore</h3>
<ul>
  <li>Question 1?</li>
  <li>Question 2?</li>
</ul>

<h3>📋 Next Steps</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Research idea 1</p></div></li>
  <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Prototype concept</p></div></li>
</ul>`,
  },
  {
    id: "code-snippet",
    name: "Code Snippet",
    description: "Document code with explanation",
    icon: <IconCode size={24} />,
    category: "work",
    content: `<h2>Code Snippet</h2>

<h3>Purpose</h3>
<p>[What does this code do?]</p>

<h3>Language/Framework</h3>
<p>[e.g., JavaScript, Python, React, etc.]</p>

<h3>Code</h3>
<pre><code>// Your code here
function example() {
  return "Hello, World!";
}</code></pre>

<h3>Usage Example</h3>
<pre><code>// How to use this code
const result = example();
console.log(result);</code></pre>

<h3>Notes</h3>
<ul>
  <li>Note about implementation</li>
  <li>Edge cases to consider</li>
  <li>Dependencies required</li>
</ul>

<h3>Related Links</h3>
<ul>
  <li><a href="#">Documentation</a></li>
  <li><a href="#">Stack Overflow reference</a></li>
</ul>`,
  },
  {
    id: "blog-post",
    name: "Blog Post",
    description: "Structure for writing blog articles",
    icon: <IconArticle size={24} />,
    category: "creative",
    content: `<h1>Blog Post Title</h1>
<p><em>Subtitle or hook that draws readers in</em></p>

<h2>Introduction</h2>
<p>[Hook your reader with an interesting opening. What problem are you solving or topic are you exploring?]</p>

<h2>Main Point 1</h2>
<p>[Expand on your first key point]</p>

<h2>Main Point 2</h2>
<p>[Expand on your second key point]</p>

<h2>Main Point 3</h2>
<p>[Expand on your third key point]</p>

<h2>Conclusion</h2>
<p>[Summarize key takeaways and include a call to action]</p>

<hr>

<p><strong>Tags:</strong> [tag1, tag2, tag3]</p>
<p><strong>Word Count Goal:</strong> [Target words]</p>`,
  },
  {
    id: "quick-note",
    name: "Quick Note",
    description: "Simple note with timestamp",
    icon: <IconNotes size={24} />,
    category: "personal",
    content: `<h2>Quick Note</h2>
<p><strong>Created:</strong> ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>

<p>[Start typing your note here...]</p>`,
  },
];

interface NoteTemplatesProps {
  onSelectTemplate: (content: string, title: string) => void;
  onClose: () => void;
}

export default function NoteTemplates({ onSelectTemplate, onClose }: NoteTemplatesProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    { id: "all", name: "All Templates" },
    { id: "productivity", name: "Productivity" },
    { id: "personal", name: "Personal" },
    { id: "work", name: "Work" },
    { id: "creative", name: "Creative" },
  ];

  const filteredTemplates = TEMPLATES.filter((template) => {
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (template: NoteTemplate) => {
    onSelectTemplate(template.content, template.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <IconTemplate size={20} className="text-mercedes-primary" />
            <h2 className="text-lg font-semibold">Choose a Template</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-4 border-b border-neutral-200 space-y-3">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:border-mercedes-primary"
          />
          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  selectedCategory === category.id
                    ? "bg-mercedes-primary text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <IconTemplate size={40} className="mx-auto mb-2 opacity-50" />
              <p>No templates match your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="p-4 border border-neutral-200 rounded-xl text-left hover:border-mercedes-primary hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600 group-hover:bg-mercedes-primary/10 group-hover:text-mercedes-primary transition-colors">
                      {template.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-neutral-800 group-hover:text-mercedes-primary transition-colors">
                        {template.name}
                      </h3>
                      <p className="text-sm text-neutral-500 mt-1">
                        {template.description}
                      </p>
                      <span className="inline-block mt-2 px-2 py-0.5 bg-neutral-100 text-neutral-500 text-xs rounded-full capitalize">
                        {template.category}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 text-center text-sm text-neutral-500">
          Click a template to use it for your new note
        </div>
      </div>
    </div>
  );
}

// Export templates for use elsewhere
export { TEMPLATES };
