import json
import os
from datetime import datetime

class TodoApp:
    def __init__(self):
        self.filename = "tasks.json"
        self.tasks = []
        self.next_id = 1
        self.load_from_file()

    def display_menu(self):
        print("\n===== TO-DO LIST APPLICATION =====")
        print("1. Add Task")
        print("2. View All Tasks")
        print("3. View Active Tasks")
        print("4. View Completed Tasks")
        print("5. Mark Task as Complete")
        print("6. Edit Task")
        print("7. Delete Task")
        print("8. Clear Completed Tasks")
        print("9. Show Statistics")
        print("10. Exit")
        print("==================================\n")

    def add_task(self):
        text = input("Enter task description: ").strip()
        
        if not text:
            print("Task cannot be empty!")
            return
        
        task = {
            "id": self.next_id,
            "text": text,
            "completed": False,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        self.tasks.append(task)
        self.next_id += 1
        self.save_to_file()
        print("Task added successfully!")

    def view_all_tasks(self):
        if not self.tasks:
            print("\nNo tasks found!")
            return
        
        print("\n===== ALL TASKS =====")
        self.display_tasks(self.tasks)

    def view_active_tasks(self):
        active_tasks = [task for task in self.tasks if not task["completed"]]
        
        if not active_tasks:
            print("\nNo active tasks!")
            return
        
        print("\n===== ACTIVE TASKS =====")
        self.display_tasks(active_tasks)

    def view_completed_tasks(self):
        completed_tasks = [task for task in self.tasks if task["completed"]]
        
        if not completed_tasks:
            print("\nNo completed tasks!")
            return
        
        print("\n===== COMPLETED TASKS =====")
        self.display_tasks(completed_tasks)

    def mark_task_complete(self):
        if not self.tasks:
            print("\nNo tasks to mark!")
            return
        
        self.view_all_tasks()
        
        try:
            task_id = int(input("Enter task ID to mark as complete: "))
            
            for task in self.tasks:
                if task["id"] == task_id:
                    task["completed"] = True
                    self.save_to_file()
                    print("Task marked as complete!")
                    return
            
            print("Task not found!")
        except ValueError:
            print("Invalid input!")

    def edit_task(self):
        if not self.tasks:
            print("\nNo tasks to edit!")
            return
        
        self.view_all_tasks()
        
        try:
            task_id = int(input("Enter task ID to edit: "))
            
            for task in self.tasks:
                if task["id"] == task_id:
                    new_text = input("Enter new task description: ").strip()
                    
                    if new_text:
                        task["text"] = new_text
                        self.save_to_file()
                        print("Task updated successfully!")
                    return
            
            print("Task not found!")
        except ValueError:
            print("Invalid input!")

    def delete_task(self):
        if not self.tasks:
            print("\nNo tasks to delete!")
            return
        
        self.view_all_tasks()
        
        try:
            task_id = int(input("Enter task ID to delete: "))
            
            for i, task in enumerate(self.tasks):
                if task["id"] == task_id:
                    self.tasks.pop(i)
                    self.save_to_file()
                    print("Task deleted successfully!")
                    return
            
            print("Task not found!")
        except ValueError:
            print("Invalid input!")

    def clear_completed(self):
        self.tasks = [task for task in self.tasks if not task["completed"]]
        self.save_to_file()
        print("Completed tasks cleared!")

    def show_statistics(self):
        total = len(self.tasks)
        completed = sum(1 for task in self.tasks if task["completed"])
        active = total - completed
        
        print("\n===== STATISTICS =====")
        print(f"Total Tasks: {total}")
        print(f"Active Tasks: {active}")
        print(f"Completed Tasks: {completed}")
        
        if total > 0:
            completion_rate = (completed / total) * 100
            print(f"Completion Rate: {completion_rate:.1f}%")

    def run(self):
        while True:
            self.display_menu()
            
            try:
                choice = int(input("Enter your choice: "))
                
                if choice == 1:
                    self.add_task()
                elif choice == 2:
                    self.view_all_tasks()
                elif choice == 3:
                    self.view_active_tasks()
                elif choice == 4:
                    self.view_completed_tasks()
                elif choice == 5:
                    self.mark_task_complete()
                elif choice == 6:
                    self.edit_task()
                elif choice == 7:
                    self.delete_task()
                elif choice == 8:
                    self.clear_completed()
                elif choice == 9:
                    self.show_statistics()
                elif choice == 10:
                    print("Goodbye!")
                    break
                else:
                    print("Invalid choice! Please try again.")
            
            except ValueError:
                print("Invalid input! Please enter a number.")
            except KeyboardInterrupt:
                print("\n\nGoodbye!")
                break
            except Exception as e:
                print(f"An error occurred: {e}")

    def display_tasks(self, task_list):
        for task in task_list:
            status = "[X]" if task["completed"] else "[ ]"
            print(f"[{task['id']}] {status} {task['text']}")

    def save_to_file(self):
        try:
            with open(self.filename, 'w') as f:
                json.dump(self.tasks, f, indent=2)
        except IOError as e:
            print(f"Error saving tasks: {e}")

    def load_from_file(self):
        try:
            if os.path.exists(self.filename):
                with open(self.filename, 'r') as f:
                    self.tasks = json.load(f)
                    
                    if self.tasks:
                        max_id = max(task["id"] for task in self.tasks)
                        self.next_id = max_id + 1
        except (IOError, json.JSONDecodeError) as e:
            print(f"Error loading tasks: {e}")
            self.tasks = []


if __name__ == "__main__":
    app = TodoApp()
    app.run()
