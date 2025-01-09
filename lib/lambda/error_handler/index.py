import json


def create_response(retryable, retryCount):
    res = {
        "type": "retryable" if retryable else "fatal",
        "retryCount": retryCount,
        "waitTimeSeconds": 2 ** retryCount,
    }
    return res


def get_retry_count(event):
    try:
        return event['Payload']['retryCount'] + 1
    except KeyError:
        return 0


def is_retryable(cause):
    # Retryable errors ECS returns
    # https://docs.aws.amazon.com/AmazonECS/latest/userguide/stopped-task-error-codes.html
    if cause['StoppedReason'].startswith("CannotPullContainerError"):
        return True
    if cause['StoppedReason'].startswith("ResourceInitializationError"):
        return True

    # Retryable errors your application returns
    contianer = cause['Containers'][0]
    if contianer.get('ExitCode', 0) in [6]:
        return True
    return False


def handler(event, context):
    print(event)
    cause = json.loads(event['RunTaskError']['Cause'])
    retry_count = get_retry_count(event)

    return create_response(is_retryable(cause), retry_count)