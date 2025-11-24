"use client";

import { useState } from "react";
import { Loader2, Plus, Edit, Trash2, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useMessageTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from "@/hooks/use-messages";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const templateFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  body: z.string().min(1, "Body is required").max(500, "Body must be 500 characters or less"),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

type TemplateRecord = {
  id: string;
  name: string;
  body: string;
};

export default function TemplatesPage() {
  const { role } = useAppShell();
  const [editingTemplate, setEditingTemplate] = useState<TemplateRecord | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useMessageTemplates();
  const templates = data?.templates ?? [];

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      body: "",
    },
  });

  const isStaff = role === "STAFF";
  const isSubmitting = createTemplate.isPending || updateTemplate.isPending;

  const handleOpenDialog = (template?: TemplateRecord) => {
    if (template) {
      setEditingTemplate(template);
      form.reset({
        name: template.name,
        body: template.body,
      });
    } else {
      setEditingTemplate(null);
      form.reset({
        name: "",
        body: "",
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    form.reset();
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          ...values,
        });
        toast.success("Template updated successfully");
      } else {
        await createTemplate.mutateAsync(values);
        toast.success("Template created successfully");
      }
      handleCloseDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save template");
    }
  });

  const handleDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await deleteTemplate.mutateAsync(deletingTemplate.id);
      toast.success("Template deleted successfully");
      setDeletingTemplate(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete template");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Message Templates</h1>
          <p className="text-sm text-muted-foreground">Create and manage reusable message templates</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading templates...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the template name and message body."
                : "Create a new reusable message template for quick customer communications."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Car Ready" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message Body</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Your vehicle is ready for pickup..."
                        rows={6}
                        {...field}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : editingTemplate ? (
                "Update Template"
              ) : (
                "Create Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Message Templates</h1>
          <p className="text-sm text-muted-foreground">Create and manage reusable message templates</p>
        </div>
        {!isStaff && (
          <Button onClick={() => handleOpenDialog()} size="sm" className="gap-2">
            <Plus className="size-4" />
            New Template
          </Button>
        )}
      </div>

      {isStaff ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Staff users cannot create or edit templates. Please contact a manager or administrator.
            </p>
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="size-12 text-muted-foreground mb-4" />
            <p className="text-sm font-medium mb-1">No templates yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first template to speed up customer communications
            </p>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="size-4" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  {!isStaff && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(template)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingTemplate(template)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {template.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


