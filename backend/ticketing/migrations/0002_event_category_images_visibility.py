# Hand-written to match the 0001_initial style; please regenerate/verify with
# `manage.py makemigrations --check --dry-run` in Docker before merging.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ticketing", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="category",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="event",
            name="images",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="event",
            name="visibility",
            field=models.CharField(
                choices=[
                    ("public", "public"),
                    ("unlisted", "unlisted"),
                    ("private", "private"),
                ],
                default="public",
                max_length=10,
            ),
        ),
    ]
